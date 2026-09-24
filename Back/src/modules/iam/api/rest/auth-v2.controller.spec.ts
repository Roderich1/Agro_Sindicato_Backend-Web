import { BadRequestException } from "@nestjs/common";
import { Request } from "express";
import { selectCredential } from "./auth-v2.controller";

function requestWithCookie(cookie?: string): Request {
  return { cookies: cookie ? { refresh_token_v2: cookie } : {} } as Request;
}

describe("auth V2 refresh credential transport", () => {
  it("selects COOKIE when only refresh_token_v2 is present", () => {
    expect(selectCredential(requestWithCookie("cookie-token"))).toEqual({
      token: "cookie-token",
      source: "COOKIE",
    });
  });

  it("selects BODY when only the explicit DTO token is present", () => {
    expect(selectCredential(requestWithCookie(), "body-token")).toEqual({
      token: "body-token",
      source: "BODY",
    });
  });

  it("rejects cookie and body ambiguity", () => {
    expect(() =>
      selectCredential(requestWithCookie("cookie-token"), "body-token"),
    ).toThrow(BadRequestException);
  });
});
