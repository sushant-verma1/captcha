# Workspace packages

- shared-types exports the decision union, protected action, trace point, and decision response types.
- captcha-engine currently owns canvas primitives and challenge render version; future geometry belongs here.
- risk-engine currently owns risk decision context/result types; future deterministic rules belong here.
- browser-sdk currently owns client/protect option interfaces; do not put server authority or secrets in this package.
- All packages compile to dist and expose only their index entry point.