// A near-black Monaco theme that matches the app's dark surfaces, so code
// editors don't render as white cards in dark mode.
export function defineUspDark(monaco: any) {
  monaco.editor.defineTheme("usp-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#161616",
      "editor.lineHighlightBackground": "#1f1f1f",
      "editorGutter.background": "#161616",
      "editorLineNumber.foreground": "#5a5a5a",
      "editorWidget.background": "#1c1c1c",
      "editorWidget.border": "#2a2a2a",
      "editorSuggestWidget.background": "#1c1c1c",
      "editorSuggestWidget.selectedBackground": "#2a2a2a",
      "input.background": "#1c1c1c",
      "dropdown.background": "#1c1c1c",
    },
  });
}

/** Resolve the Monaco theme name from the app's resolved theme. */
export const monacoTheme = (resolved: "light" | "dark") => (resolved === "dark" ? "usp-dark" : "light");
