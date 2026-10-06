# Security and privacy

This integration uses a private Albert Heijn API and stores account access/refresh tokens in Home Assistant. Treat tokens, one-time authorization URLs, configuration storage and Home Assistant backups as credentials.

## Reporting a vulnerability

Do not disclose tokens or exploit details in a public issue. If GitHub offers **Report a vulnerability** for this repository, use that private channel. If private reporting is unavailable, open a minimal issue asking the maintainer for a private contact method, without sensitive details.

Include the affected version, impact and a redacted reproduction once a private channel is established. No response-time guarantee is made.

## User precautions

- Keep Home Assistant and dashboard devices updated and access-controlled.
- Use HTTPS for camera access.
- Review and redact debug logs and screenshots before sharing them.
- Reauthenticate if AH rejects your credentials; do not publish the login redirect.
- Barcode decoding is local to the dashboard device. Lookup and list changes require AH's cloud.
- The legacy JavaScript decoder loads from jsDelivr. The normal C++ decoder is bundled.

Security improvements should target the current release. Compatibility or security fixes for older versions are not guaranteed.

See [third-party notices](THIRD_PARTY_NOTICES.md) for decoder licensing.
