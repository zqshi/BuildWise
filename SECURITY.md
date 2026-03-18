# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| v2.x    | :white_check_mark: |
| < v2.0  | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in BuildWise, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to the project maintainers with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. Potential impact assessment
4. Any suggested fixes (optional)

## Response Timeline

- **Acknowledgment**: Within 48 hours of report
- **Initial Assessment**: Within 5 business days
- **Fix Timeline**: Dependent on severity
  - Critical: Within 7 days
  - High: Within 14 days
  - Medium: Within 30 days
  - Low: Next scheduled release

## Disclosure Policy

- We follow coordinated disclosure practices
- We will credit reporters in security advisories (unless anonymity is requested)
- We ask reporters to allow a reasonable time for fixes before public disclosure

## Security Best Practices for Contributors

- Never commit secrets, API keys, or credentials to the repository
- Use environment variables for all sensitive configuration
- Follow the principle of least privilege in code
- Validate all external input at system boundaries
- Keep dependencies up to date and monitor for known vulnerabilities
