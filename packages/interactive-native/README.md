# Portable learning reference interpreter

Foundation-only Swift reference for Nomi's `portable.learning/draft-1` computations,
state events and Reset actions. It reads the same IR as the React renderer; no
JavaScript engine or WebView is involved.

From the repository root, with Node / pnpm dependencies and `swiftc` installed:

```sh
pnpm check:interactive-native
```

The script builds the TypeScript runtime, compiles these Swift sources into ignored
`.artifacts/interactive-native/`, replays the shared fixtures and compares every
state, derived value, curve point and node property within `1e-9` absolute error.

This is a trusted-fixture conformance tool, not a production document validator or
SwiftUI renderer. Mobile integration, untrusted import validation, durable storage
and sync are future work. See `docs/design-docs/interactive-learning-runtime.md`.
