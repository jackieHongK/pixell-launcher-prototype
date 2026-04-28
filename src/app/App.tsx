import { PixellThemeProvider } from "./components/pixell-theme";
import { PixellLauncher } from "./components/pixell-launcher";

export default function App() {
  return (
    <PixellThemeProvider>
      <PixellLauncher />
    </PixellThemeProvider>
  );
}
