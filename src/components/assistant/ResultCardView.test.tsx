import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/hooks/useI18n", () => ({ useI18n: () => ({ t: (k: string) => k, locale: "en" }) }));
import { ResultCardView } from "./ResultCardView";

describe("ResultCardView", () => {
  it("renders title, price and a booking link", () => {
    render(
      <ResultCardView
        card={{
          kind: "provider",
          id: "p1",
          title: "Mario Rossi",
          priceLabel: "€40/h",
          bookingHref: "/book?providerId=p1",
        }}
      />
    );
    expect(screen.getByText("Mario Rossi")).toBeTruthy();
    expect(screen.getByText("€40/h")).toBeTruthy();
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/book?providerId=p1");
  });
});
