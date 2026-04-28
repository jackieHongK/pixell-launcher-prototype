# PMS Export 옵션 → ffmpeg 커맨드 매핑

코드 그라운드 트루스 기반의 **유저 화면 선택값 → ffmpeg 인자** 매핑 정리.

---

## 0) 공통 ffmpeg 인풋 프리앰블

`VideoCmdGenerator.ffmpeg_output_command` 의 출력은 항상 **stdin pipe로 raw RGB24 프레임을 받는 구조** (`video.py:477-489`):

```bash
ffmpeg [-noautorotate -display_rotation N]   # rotation != 0 일 때
  -y -f rawvideo -pix_fmt rgb24
  -r {original_fps}
  -s {W*size_ratio}x{H*size_ratio}            # SR1/SR2 액션 시 size_ratio=2
  -i pipe:
  ...                                          # ↓ 코덱·옵션 인자
```

> 중간 단계 출력(`_is_output_video_final == False`)은 무조건 `libx264 / yuv420p / -profile:v main / -b:v 200M` 의 고정 임시 인코딩으로 강제 (`video.py:510-536`).

---

## 1) 코덱 + 컨테이너 + 프로파일 표 (UI에서 동적으로 열리는 옵션)

| UI codec | label | container 후보 (UI) | profile 후보 (UI) | ffmpeg `-c:v` | profile 옵션 키 | ffmpeg `-profile:v` 값 | `-pix_fmt` |
|---|---|---|---|---|---|---|---|
| `libx264` | H264 | mp4 / mov / mkv / ts¹ | `high`, `main` | `libx264` | `-profile:v` | `high` 또는 `main` (UI값 그대로) | `yuv420p` |
| `libx265` | H265 | mp4 / mov / mkv / ts¹ | `main`, `main10` | `libx265` | `-profile:v` | `main` / `main10` (UI값 그대로) | `main`→`yuv420p` / `main10`→`yuv420p10le` |
| `libvpx-vp9` | VP9 | mp4 / mov / mkv | `good`, `best` | `libvpx-vp9` | **`-deadline`** (특수!) | `good` / `best` | `yuv420p` |
| `prores_ks` | ProRes | mov 만 | `422proxy / 422lt / 422 / 422hq / 4444 / 4444xq` | `prores_ks` | `-profile:v` | **숫자로 매핑**: `0/1/2/3/4/5` | 422계열→`yuv422p10le`, 4444계열→`yuv444p10le` |
| `xavc59` | XAVC 59.94 | mxf 만 | (UI에 6+2개 노출되지만) | (특수경로 → OMX) | n/a | profile 인자 미사용 | `yuv420p` (일반경로) / 특수경로는 OMX 별도 |
| `xavc29` | XAVC 29.97 | mxf 만 | (UI에 6+2개 노출되지만) | (특수경로 → OMX) | n/a | profile 인자 미사용 | `yuv420p` |

¹ `ts`는 UI 셀렉터에서 `.filter((c) => c.value !== "ts")` 로 **숨김** → Master 화면에서는 선택 불가, HLS 모드(`ExportSettingLive`) 전용으로 들어옴.

> 핵심 분기 `set_codec_profile_bitdepth` ⇒ `video.py:172-229`
> profile 옵션 키 분기 ⇒ `video.py:243` `profile_option = "-deadline" if codec=="libvpx-vp9" else "-profile:v"`

---

## 2) Quality vs Advanced (Bitrate) 분기

`advancedSettingYn` 토글에 따라 인자 구성이 완전히 달라짐 (`video.py:294-355`).

### 2-1. Quality 모드 (advancedSettingYn = 0)
ProRes/XAVC가 아닐 때만 UI에 노출. **profile 인자는 빠지고 CRF만 적용**.

| UI quality | 값 | libx264 CRF | 그 외(265/VP9 등) CRF |
|---|---|---|---|
| Low | `0` | `-crf 23` | `-crf 28` |
| Good | `1` | `-crf 10` | `-crf 10` |
| Best | `2` | `-crf 3` | `-crf 3` |

생성되는 인자:
```
-r {fps} -c:v {codec} -pix_fmt {bit_depth} -vf {vf} -crf {crf}
```

### 2-2. Advanced(Bitrate) 모드 (advancedSettingYn = 1)
| UI bitRateType | targetBitRate(kbps) | maxBitRate(kbps) | 결과 인자 |
|---|---|---|---|
| `VBR` | 사용자 입력 | 사용자 입력 | `-b:v {target}K -maxrate {max}K` |
| `CBR` | 사용자 입력 | (UI disabled) | `-b:v {target}K -maxrate {target}K` |

생성되는 인자(`profile_option`도 포함됨):
```
-r {fps} -c:v {codec} {profile_option} {profile} -pix_fmt {bit_depth} -vf {vf}
-b:v {target}K -maxrate {max}K
```

> 참고: `prores_ks` 는 UI에서 Quality / Bitrate 영역 자체가 숨겨짐(`codec !== "prores_ks"`). 즉 ProRes는 advancedSetting을 켤 수 없고, 그러면 quality 모드 분기를 타지만 **UI에서 quality 버튼도 숨김** → 기본값이 그대로 들어가 `-crf 10` 이 적용됨에 유의.

### 2-3. Two-Pass (twoPass = 1, advancedSettingYn = 1 일 때만 의미)
`actions/two_pass.py` 가 두 번 호출:

**1st pass** (`ffmpeg_twopass_input_command` ⇒ `video.py:683-774`)
```bash
ffmpeg -y -i {input} -r {fps} -c:v {codec} {profile_option} {profile}
  -pix_fmt {bit_depth} -vf {vf} -b:v {target}K -maxrate {max}K
  -pass 1 -passlogfile {log} {output}
```

**2nd pass** (`ffmpeg_twopass_output_command` ⇒ `video.py:776-878`)
```bash
ffmpeg -y -i {input} (...same as 1st...)
  [-aspect {DAR}]   # AR이 None이 아니면 추가
  -pass 2 -passlogfile {log} {output}
```

---

## 3) Resize / Aspect Ratio (`-vf` 필터 빌더)

UI에서 `resizeYn`이 켜졌을 때만 적용됨. 기본 `-vf` 베이스는 항상 `colorspace=bt709:iall=bt601-6-625:fast=1`. 폭/높이 홀수면 `crop=trunc(iw/2)*2:trunc(ih/2)*2,` 가 앞에 붙음 (`video.py:245-247`).

### 3-1. ResizeCode → 해상도
| UI resizeCode | 라벨 | 픽셀 |
|---|---|---|
| RE001 | 720x480 | (720, 480) |
| RE002 | 1280x720 | (1280, 720) |
| RE003 | 1920x1080 | (1920, 1080) |
| RE004 | 3840x2160 | (3840, 2160) |
| RE005 | 7680x4320 | (7680, 4320) |
| RE006 | Custom | UI에서 `resizeWidth/resizeHeight` 입력값 사용 |

> XAVC 코덱이 선택되면 UI에서 `RE004`(3840x2160) 만 노출 (`ExportSettingMaster.tsx:86-88`).

### 3-2. resizeMode → 필터 문자열
| UI resizeMode | UI 라벨 | `-vf` 추가 문자열 |
|---|---|---|
| `0` | Scale to Fit | `,scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1` |
| `1` | Stretch to Fill | `,scale={w}x{h}:flags=lanczos,setsar=1` |

### 3-3. AspectRatio (AR) → SAR
`-vf` 에 `,setsar={value}` 추가. AR001 (Original) 이면 SAR 미설정 + 원본 SAR이 있으면 그대로 유지(또는 `scale=ceil(iw*sar/2)*2:ih`).

| UI aspectRatio | 라벨 | setsar 값 | 추가 동작 |
|---|---|---|---|
| AR001 | Originals | (없음) | 원본 SAR 보존 (resizeMode=0이면 짝수 보정 scale) |
| AR002 | Square Pixels | `1.0` | |
| AR003 | DV NTSC | `0.9091` | |
| AR004 | DV NTSC 16:9 | `1.2121` | |
| AR005 | DV PAL | `1.0940` | |
| AR006 | DV PAL 16:9 | `1.4587` | |
| AR007 | Anamorphic 2:1 | `2.0` | |
| AR008 | HD Anamorphic | `1.333` | |
| AR009 | DVCPRO HD | `1.5` | |

추가로, AR이 None(AR001) **그리고** resizeYn=0 이면 출력 끝에 `-aspect {DAR}` 가 붙음 (`video.py:498-505`).

> XAVC 선택 시 UI에서 frameRate / aspectRatio 셀렉터가 **숨김** (`ExportSettingMaster.tsx:162, 206`).

---

## 4) Frame Rate (`-r`)

| UI targetFrameRate | 라벨 | ffmpeg `-r` 값 |
|---|---|---|
| FR001 | Originals | 원본 fps 그대로 |
| FR002 | 23.976 | `23.976` |
| FR003 | 24 | `24` |
| FR004 | 29.97 | `29.97` |
| FR005 | 30 | `30` |
| FR006 | 50 | `50` |
| FR007 | 59.94 | `59.94` |
| FR008 | 60 | `60` |
| FR009 | 90 | `90` |
| FR010 | 120 | `120` |

`-r` 은 출력 인자 영역에서 1번만 등장. (인풋 쪽은 항상 원본 fps로 pipe input)

---

## 5) Timecode

| UI timecode | 라벨 | 추가 인자 |
|---|---|---|
| `0` | Non-Drop Frame | (없음) |
| `1` | Drop Frame | `-timecode 00:00:00;00`  (XAVC 경로는 OMX 파라미터에 `:timecode="00:00:00.00"` 포함) |

---

## 6) Audio (별도 ffmpeg 호출)

오디오는 메인 비디오 인코딩과 분리되어 `actions/audio.py` 의 split 단계에서 추출됨.

### 6-1. Audio Codec
| UI audioCodec | 라벨 | enum value | 실제 ffmpeg `-c:a` |
|---|---|---|---|
| AC001 | Copy | `copy` | `copy` (입력에서 비트스트림 그대로) |
| AC002 | AAC | `aac` | `aac` |
| AC003 | PCM | `pcm` | `pcm_s16le` |
| AC004 | OPUS | `opus` | `libopus` |

생성 커맨드 (`audio.py:53-128`):
- `copy` 일 때: `ffmpeg -y -i {in} -vn -map 0:a -c:a copy {out_audio}`
- 그 외: `ffmpeg -y -i {in} -vn -c:a {codec} -ab {bitrate}K {out_audio}`
- 컨테이너가 `ts`(HLS)일 땐 위 매핑 무시하고 강제로 `-c:a aac -b:a 192k` (`audio.py:58-73`)

### 6-2. Audio Bitrate
| UI audioBitRate | 라벨(kbps) | enum value | 출력 인자 |
|---|---|---|---|
| AB001 | 64 | 64 | `-ab 64K` |
| AB002 | 80 | 80 | `-ab 80K` |
| AB003 | 96 | 96 | `-ab 96K` |
| AB004 | 112 | 112 | `-ab 112K` |
| AB005 | 128 | 128 | `-ab 128K` |
| AB006 | 160 | 160 | `-ab 160K` |
| AB007 | 192 | 192 | `-ab 192K` |
| AB008 | 224 | 224 | `-ab 224K` |
| AB009 | 256 | 256 | `-ab 256K` |
| AB010 | 320 | 320 | `-ab 320K` |

UI에서 `audioCodec === "AC001"` (Copy) 이면 비트레이트 셀렉터 **숨김**.

> 코덱별 UI 노출 audioCodecs 목록(동적):
> - `libx264 / libx265` → Copy, AAC
> - `libvpx-vp9` → Copy, AAC, OPUS
> - `prores_ks` → Copy, PCM
> - `xavc59 / xavc29` → Copy 만

---

## 7) ProRes 특수 처리

UI 동적 동작:
- container를 **mov 한 가지**로 강제 (`prores_ks.containers`)
- profile 6종(`422proxy / 422lt / 422 / 422hq / 4444 / 4444xq`) 강제
- **Quality 영역 + Advanced(Bitrate/2pass) 영역 모두 UI에서 숨김** (`codec !== "prores_ks"` 가드)
- audioCodecs는 **Copy / PCM** 만

ffmpeg 인자:
- `-c:v prores_ks -profile:v {0~5} -pix_fmt yuv422p10le|yuv444p10le`
- 비트레이트 영역이 잠겨 있으니 결국 **Quality 모드 분기**로 가서 `-crf 10` 이 박힘 (libx264가 아니므로 Best=3, Good=10, Low=28; UI 숨김이므로 기본값이 quality=1 이어서 `-crf 10`)

---

## 8) XAVC + MXF 특수 처리 — **별도 OMX ffmpeg 바이너리**

조건: `codec.startswith("xavc")` AND `container == "mxf"` 이고 **최종 출력**일 때 (`video.py:387-471`).

UI 동작 차이:
- container를 **mxf**만, frameRate/aspectRatio 셀렉터 **숨김**
- ResizeCode는 **RE004(3840x2160) 강제**
- Quality 셀렉터/버튼 **disabled**
- AdvancedSetting 토글 **disabled**
- audioCodec **Copy 강제**

생성 커맨드 (일반 `ffmpeg` 가 아닌 **`/opt/mainconcept/ffmpeg-omx/bin/ffmpeg`**):
```bash
/opt/mainconcept/ffmpeg-omx/bin/ffmpeg
  -y -f rawvideo -pix_fmt rgb24
  -r {original_fps}
  -s {W*size_ratio}x{H*size_ratio}
  -i pipe:
  -vf {vf}
  -c:v omx_enc_avc
  -omx_core libomxil_core.so
  -omx_name OMX.MainConcept.enc_avc.video
  -f omx_mxf_mux
  -omx_format_name OMX.MainConcept.mux_mxf.other
  -omx_param "preset=xavc_qfhd_intra_class_300_cbg:acc_type=sw"
  -omx_format_param "mplex_type=XAVC_SXS:profile=MXF_PROF_SONY_XDCAM[:timecode=\"00:00:00.00\"]"
  -s 3840x2160
  -r {frame_rate}
  [-aspect {DAR}]
  {output.mxf}
```

코덱별로 강제되는 frame_rate (`video.py:390-393`):
| UI codec | `-r` 값 (frame_rate) |
|---|---|
| `xavc59` | `60000/1001` |
| `xavc29` | `30000/1001` |

> profile은 OMX 경로에선 사실상 사용되지 않음 — 대신 `-omx_param preset=xavc_qfhd_intra_class_300_cbg:acc_type=sw` 가 박힘. UI의 profile 셀렉트값은 무시.

---

## 9) HLS 특수 처리 (`container == "ts"`) — `ExportSettingLive`

`_build_hls_command()` ⇒ `video.py:539-680`. 이 모드는 Master 화면이 아니라 **Live 화면 (`ExportSettingLive.tsx`)** 에서 진입. 사용자는 **variant 단위(idx별)** 로 옵션을 입력하며, 각 variant마다 다음을 지정:

| variant 입력 | 결과 인자 |
|---|---|
| width, height | `-filter:v:{idx} colorspace=bt709:iall=bt601-6-625:fast=1,scale={w}:{h}` |
| bitRateType=VBR + target/max | `-b:v:{idx} {t}K -maxrate:v:{idx} {m}K -bufsize:v:{idx} {m*2}K` |
| bitRateType=CBR + target | `-b:v:{idx} {t}K -minrate:v:{idx} {t}K -maxrate:v:{idx} {t}K -bufsize:v:{idx} {t*2}K` |
| audioBitRate (variant별) | `-c:a:{idx} {audio_codec} -b:a:{idx} {bitrate}K` |
| loudnessYn=1, loudness=L | `-filter:a:{idx} loudnorm=I={L}:LRA=7:TP=-2` |

전역(인코딩 설정 공유):
- `-c:v {codec}`, `{profile_option} {profile}`, `-pix_fmt {bit_depth}` (1번만)
- `-c:a {audio_codec}` (audio split이 별도 출력한 경우)
- `keyFrameInterval` (sec) × 원본 fps → `-g N -keyint_min N -sc_threshold 0`
- `segmentDuration` → `-hls_time {n}` (없으면 `10`)
- 고정: `-f hls -hls_playlist_type vod -hls_list_size 0 -hls_flags independent_segments`
- variant 매핑 → `-var_stream_map "v:0,a:0,name:1920x1080 v:1,a:1,name:1280x720 …"`
- 출력: `-master_pl_name master.m3u8 -hls_segment_filename {dir}/%v/%06d.ts {dir}/%v/index.m3u8`

> HLS 진입 시 audio split 단계도 강제로 `-c:a aac -b:a 192k` 로 미리 변환 (`audio.py:58-73`).

---

## 10) 한눈에 보는 모드 매트릭스

| 모드 진입 조건 | 호출 메서드 | 실행 위치 | 비고 |
|---|---|---|---|
| 일반(단일 패스, 1pass만) | `ffmpeg_output_command` | `transcoding.py` (현재 TODO 상태로 실 호출 비어있음) | 단일패스 실 실행은 미완 |
| `twoPass=1` | `ffmpeg_twopass_input_command` → `..._output_command` | `actions/two_pass.py` (`subprocess.Popen` 두 번) | advancedSettingYn=1일 때만 의미 |
| `container=ts` | `ffmpeg_output_command` 내부에서 `_build_hls_command()` 호출 | (HLS 마스터/세그먼트 출력) | ExportSettingLive 화면 사용 |
| `xavc* + mxf` | `ffmpeg_output_command` 내부 XAVC 분기 | `/opt/mainconcept/ffmpeg-omx/bin/ffmpeg` | OMX MainConcept 라이선스 필요 |

---

## 11) 사용자 시나리오 예시 (조립 결과)

**예시 A** — H264 / mp4 / Quality=Good / 1920x1080(Scale to Fit) / 29.97 / DF / AAC@192k
```bash
ffmpeg -y -f rawvideo -pix_fmt rgb24 -r 23.976 -s 3840x2160 -i pipe: \
  -r 29.97 -c:v libx264 -pix_fmt yuv420p \
  -vf "colorspace=bt709:iall=bt601-6-625:fast=1,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -crf 10 -timecode 00:00:00;00 \
  {run_id}_trans.mp4
```
+ 별도 오디오: `ffmpeg -y -i {src} -vn -c:a aac -ab 192K {run_id}_audio.mp4`

**예시 B** — H265 / mkv / Advanced VBR(target=8000, max=12000) / Main10 / 2-pass / 4K / Original FPS
```bash
# pass 1
ffmpeg -y -i {input} -r {orig} -c:v libx265 -profile:v main10 -pix_fmt yuv420p10le \
  -vf "colorspace=bt709:iall=bt601-6-625:fast=1,scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -b:v 8000K -maxrate 12000K -pass 1 -passlogfile {log} {out}
# pass 2 (동일 + -pass 2)
```

**예시 C** — ProRes / mov / 422 HQ / Resize off
```bash
ffmpeg -y -f rawvideo -pix_fmt rgb24 -r {orig} -s {W}x{H} -i pipe: \
  -r {fps} -c:v prores_ks -pix_fmt yuv422p10le \
  -vf "colorspace=bt709:iall=bt601-6-625:fast=1" \
  -crf 10 \
  -aspect {DAR} \                      # AR=AR001 + resize off → -aspect 추가
  {run_id}_trans.mov
```
※ ProRes는 quality 분기로 가지만 UI에서 profile 인자가 명시 인자에 들어가지 않는다는 점이 주목. (advanced 모드일 때만 `-profile:v 3` 로 들어감)

**예시 D** — XAVC 59.94 / mxf / 4K
```bash
/opt/mainconcept/ffmpeg-omx/bin/ffmpeg -y -f rawvideo -pix_fmt rgb24 -r {orig} -s {W}x{H} -i pipe: \
  -vf "colorspace=bt709:iall=bt601-6-625:fast=1,scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -c:v omx_enc_avc -omx_core libomxil_core.so -omx_name OMX.MainConcept.enc_avc.video \
  -f omx_mxf_mux -omx_format_name OMX.MainConcept.mux_mxf.other \
  -omx_param "preset=xavc_qfhd_intra_class_300_cbg:acc_type=sw" \
  -omx_format_param "mplex_type=XAVC_SXS:profile=MXF_PROF_SONY_XDCAM" \
  -s 3840x2160 -r 60000/1001 \
  {run_id}_trans.mxf
```

---

## 짚어둘 함정/주의점
1. **profile 인자 키가 코덱마다 다름**: VP9는 `-profile:v` 가 아니라 **`-deadline`** 으로 매핑됨 (`video.py:243, 565, 694, 788`).
2. **ProRes profile은 문자열이 아니라 숫자(0–5)** 로 변환되어 들어감.
3. **Quality 모드에서는 profile 인자가 빠진다** (`video.py:340-353` — profile_option 라인이 주석처리). Advanced 모드에서만 profile 인자가 실제로 들어감.
4. **XAVC OMX 경로는 UI profile값을 무시**. 그 자리에 `-omx_param preset=...` 가 들어감.
5. **ts(HLS) 컨테이너는 Master UI에서 명시적으로 숨김** (`.filter(c=>c.value!=="ts")`) → HLS는 별도 화면(ExportSettingLive) 입력이 필수.
6. **XAVC 선택 시 advancedSetting 토글이 disabled** (`isCodecXavc()`), Resize는 RE004 단일 옵션만, audio도 Copy 단일 옵션.
7. 중간 액션의 출력은 사용자 옵션과 무관하게 **항상 libx264/yuv420p/main/200M 임시 인코딩**으로 통일 (`video.py:510-536`).
