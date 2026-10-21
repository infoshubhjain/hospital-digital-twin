import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App.js";
import { safeCsvCell } from "./csv.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it.each([
    ["ED providers", "100", "staff"],
    ["ED beds", "500", "beds"],
    ["Admission rate percent", "0", "routing"],
  ])("blocks an unchanged %s intervention", (label, value, intervention) => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<App />);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: intervention },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "This intervention cannot change the current scenario.",
    );
    expect(screen.getByRole("button", { name: "Run simulation" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Run with these assumptions" }),
    ).toBeDisabled();
  });

  it("quotes CSV cells and neutralizes spreadsheet formulas", () => {
    expect(safeCsvCell('=1+1,"x"')).toBe('"\'=1+1,""x"""');
    expect(safeCsvCell("  @SUM(A1)")).toBe('"\'  @SUM(A1)"');
  });
});
