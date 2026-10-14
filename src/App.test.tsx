import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";
import { safeCsvCell } from "./csv.js";

afterEach(() => vi.unstubAllGlobals());

describe("dashboard", () => {
  it("shows the synthetic-data disclosure and editable scenario defaults", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<App />);
    expect(screen.getByText("Synthetic demo data")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Scenario assumptions" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("ED providers")).toHaveValue(17);
    expect(
      screen.getByRole("button", { name: /Run simulation/ }),
    ).toBeEnabled();
  });

  it("quotes CSV cells and neutralizes spreadsheet formulas", () => {
    expect(safeCsvCell('=1+1,"x"')).toBe('"\'=1+1,""x"""');
    expect(safeCsvCell("  @SUM(A1)")).toBe('"\'  @SUM(A1)"');
  });
});
