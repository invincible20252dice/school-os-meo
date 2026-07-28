import { describe, expect, it } from "vitest";
import {
  buildRankSearchLabel,
  normalizeLocationParams,
} from "./location-params";

describe("location-params", () => {
  it("normalizes station, municipality, and coordinates for rank tracking", () => {
    const params = normalizeLocationParams({
      nearestStation: "  横浜駅  ",
      municipality: " 横浜市西区 ",
      latitude: "35.4658",
      longitude: "139.6223",
      radiusMeters: 1800.9,
    });

    expect(params).toEqual({
      nearestStation: "横浜駅",
      municipality: "横浜市西区",
      latitude: 35.4658,
      longitude: 139.6223,
      radiusMeters: 1800,
    });
  });

  it("rejects incomplete coordinates", () => {
    expect(() =>
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        latitude: 35.4658,
      }),
    ).toThrow("Latitude and longitude must be set together.");
  });

  it("rejects missing station and municipality values", () => {
    expect(() =>
      normalizeLocationParams({
        nearestStation: "",
        municipality: "横浜市西区",
      }),
    ).toThrow("nearestStation is required.");
    expect(() =>
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: " ",
      }),
    ).toThrow("municipality is required.");
  });

  it("rejects invalid and out-of-range coordinates", () => {
    expect(() =>
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        latitude: "north",
        longitude: 139.6223,
      }),
    ).toThrow("Location coordinates must be valid numbers.");
    expect(() =>
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        latitude: 91,
        longitude: 139.6223,
      }),
    ).toThrow("Latitude must be between -90 and 90.");
    expect(() =>
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        latitude: 35.4658,
        longitude: -181,
      }),
    ).toThrow("Longitude must be between -180 and 180.");
  });

  it("applies default and bounded rank tracking radius", () => {
    expect(
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        latitude: "",
        longitude: "",
      }),
    ).toEqual({
      nearestStation: "横浜駅",
      municipality: "横浜市西区",
      radiusMeters: 1500,
    });
    expect(
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        radiusMeters: 1,
      }).radiusMeters,
    ).toBe(100);
    expect(
      normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        radiusMeters: 999999,
      }).radiusMeters,
    ).toBe(50000);
  });

  it("builds a precise search label from location parameters", () => {
    const label = buildRankSearchLabel({
      keyword: "個別指導 塾",
      location: normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
        latitude: 35.4658,
        longitude: 139.6223,
        radiusMeters: 1500,
      }),
    });

    expect(label).toBe(
      "個別指導 塾 / 横浜市西区 / 横浜駅 / 35.4658,139.6223 / 1500m",
    );
  });

  it("builds a search label without coordinates when only location text is configured", () => {
    const label = buildRankSearchLabel({
      keyword: "  個別指導 塾  ",
      location: normalizeLocationParams({
        nearestStation: "横浜駅",
        municipality: "横浜市西区",
      }),
    });

    expect(label).toBe("個別指導 塾 / 横浜市西区 / 横浜駅 / 1500m");
  });
});
