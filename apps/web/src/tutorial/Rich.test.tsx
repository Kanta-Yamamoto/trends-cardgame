import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Rich } from "./Rich";

describe("案内の文の強調", () => {
  it("**…** は強調、『…』はカードの名前として太くし、記号は出さない", () => {
    const { container } = render(<Rich text="まずは**キャラクター**。『切り抜き職人』を押して" />);
    expect(container.textContent).toBe("まずはキャラクター。『切り抜き職人』を押して");
    expect(container.querySelector(".tut-em")?.textContent).toBe("キャラクター");
    expect(container.querySelector(".tut-cn")?.textContent).toBe("『切り抜き職人』");
  });
});
