import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./vapidKey";

describe("urlBase64ToUint8Array", () => {
  it("decodifica una VAPID public key real a 65 bytes (punto EC sin comprimir)", () => {
    const key =
      "BAoReQjXZD_0LD2rOuMqsSmLegTqkjMzS6ZOuYVrDmOXdehdPjZQ2hfqIjumLuVvm-LkRBR6BBIxRhAPbH66ovA";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("acepta guiones y guiones bajos (base64url) sin lanzar", () => {
    expect(() => urlBase64ToUint8Array("abc-_123")).not.toThrow();
  });
});
