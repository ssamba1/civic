import { describe, expect, it } from "vitest";
import { isBlockedWebhookHost } from "./url-guard";

describe("isBlockedWebhookHost", () => {
  // --- should BLOCK ---
  describe("localhost", () => {
    it("blocks localhost", () => expect(isBlockedWebhookHost("localhost")).toBe(true));
    it("blocks uppercase LOCALHOST", () => expect(isBlockedWebhookHost("LOCALHOST")).toBe(true));
    it("blocks sub.localhost", () => expect(isBlockedWebhookHost("sub.localhost")).toBe(true));
    it("blocks attacker.localhost", () => expect(isBlockedWebhookHost("attacker.localhost")).toBe(true));
  });

  describe("loopback IPv4 (127.0.0.0/8)", () => {
    it("blocks 127.0.0.1", () => expect(isBlockedWebhookHost("127.0.0.1")).toBe(true));
    it("blocks 127.0.0.0", () => expect(isBlockedWebhookHost("127.0.0.0")).toBe(true));
    it("blocks 127.255.255.255", () => expect(isBlockedWebhookHost("127.255.255.255")).toBe(true));
  });

  describe("loopback IPv6", () => {
    it("blocks ::1", () => expect(isBlockedWebhookHost("::1")).toBe(true));
    it("blocks [::1]", () => expect(isBlockedWebhookHost("[::1]")).toBe(true));
  });

  describe("RFC-1918: 10.0.0.0/8", () => {
    it("blocks 10.0.0.1", () => expect(isBlockedWebhookHost("10.0.0.1")).toBe(true));
    it("blocks 10.255.255.255", () => expect(isBlockedWebhookHost("10.255.255.255")).toBe(true));
  });

  describe("RFC-1918: 172.16.0.0/12", () => {
    it("blocks 172.16.0.1", () => expect(isBlockedWebhookHost("172.16.0.1")).toBe(true));
    it("blocks 172.31.255.255", () => expect(isBlockedWebhookHost("172.31.255.255")).toBe(true));
    it("does NOT block 172.15.0.1 (outside /12)", () => expect(isBlockedWebhookHost("172.15.0.1")).toBe(false));
    it("does NOT block 172.32.0.1 (outside /12)", () => expect(isBlockedWebhookHost("172.32.0.1")).toBe(false));
  });

  describe("RFC-1918: 192.168.0.0/16", () => {
    it("blocks 192.168.0.1", () => expect(isBlockedWebhookHost("192.168.0.1")).toBe(true));
    it("blocks 192.168.255.255", () => expect(isBlockedWebhookHost("192.168.255.255")).toBe(true));
    it("does NOT block 192.169.0.1", () => expect(isBlockedWebhookHost("192.169.0.1")).toBe(false));
  });

  describe("link-local 169.254.0.0/16 (incl. IMDS)", () => {
    it("blocks 169.254.169.254 (AWS/GCP IMDS)", () => expect(isBlockedWebhookHost("169.254.169.254")).toBe(true));
    it("blocks 169.254.0.1", () => expect(isBlockedWebhookHost("169.254.0.1")).toBe(true));
    it("blocks 169.254.255.255", () => expect(isBlockedWebhookHost("169.254.255.255")).toBe(true));
  });

  describe("0.0.0.0", () => {
    it("blocks 0.0.0.0 literal", () => expect(isBlockedWebhookHost("0.0.0.0")).toBe(true));
    it("blocks 0.0.0.1 (0.0.0.0/8)", () => expect(isBlockedWebhookHost("0.0.0.1")).toBe(true));
  });

  // --- should ALLOW ---
  describe("valid public hosts", () => {
    it("allows example.com", () => expect(isBlockedWebhookHost("example.com")).toBe(false));
    it("allows hooks.example.com", () => expect(isBlockedWebhookHost("hooks.example.com")).toBe(false));
    it("allows 8.8.8.8 (public IP)", () => expect(isBlockedWebhookHost("8.8.8.8")).toBe(false));
    it("allows 1.1.1.1 (public IP)", () => expect(isBlockedWebhookHost("1.1.1.1")).toBe(false));
    it("allows 172.15.0.1 (just below /12)", () => expect(isBlockedWebhookHost("172.15.0.1")).toBe(false));
    it("allows 192.167.0.1", () => expect(isBlockedWebhookHost("192.167.0.1")).toBe(false));
  });
});
