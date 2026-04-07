# Release Notes Demo

Date: 2026-04-06

## Summary

This pass focused on demo readiness, workflow continuity, and presenter control rather than feature expansion.

## What Changed

- Added a seeded demo workspace with realistic sample cases, knowledge files, complaint context, and analyst guidance
- Added dashboard controls to load or reset demo data for the signed-in user
- Added per-user workspace reset support in the storage layer
- Expanded the database reset script to clear all persisted demo-relevant entities
- Stabilized route and integration tests by isolating them from local auth and database environment variables
- Added smoke coverage for root landing page, app shell route, and demo seed/reset APIs
- Updated backend non-JSON guidance to reflect the `/app` product shell flow
- Added a return path from login back to the public overview

## Demo Impact

- Presenter can start from a clean workspace without manual DB surgery
- Product now has a reliable seeded happy path for dashboard, case, quote, negotiation, and complaint walkthroughs
- Test results now reflect the app behavior instead of local environment leakage

## Verification

- `npm test`
  Result: passing
