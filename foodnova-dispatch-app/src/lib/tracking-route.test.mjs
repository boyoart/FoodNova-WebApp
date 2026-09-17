import assert from "node:assert/strict";
import test from "node:test";

import { parseOrderTrackingRoute } from "./tracking-route.ts";

test("parses the authorized order route contract", () => {
  const route = parseOrderTrackingRoute({
    tracking: {
      route_provider: "osrm",
      route_status: "Ok",
      distance_meters: 1840,
      eta_minutes: 7,
      route_polyline: [
        { latitude: 6.5, longitude: 3.3 },
        { lat: "6.51", lng: "3.31" },
      ],
    },
  });

  assert.equal(route.provider, "osrm");
  assert.equal(route.distanceMeters, 1840);
  assert.equal(route.etaMinutes, 7);
  assert.equal(route.points.length, 2);
});

test("invalid or missing route data degrades to markers-only safely", () => {
  const route = parseOrderTrackingRoute({
    tracking: {
      route_status: "UNAVAILABLE",
      route_polyline: [{ latitude: 999, longitude: 3.3 }],
    },
  });

  assert.equal(route.status, "UNAVAILABLE");
  assert.equal(route.points.length, 0);
  assert.equal(route.distanceMeters, null);
  assert.equal(route.etaMinutes, null);
});
