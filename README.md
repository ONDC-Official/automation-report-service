# ONDC Automation Report Service

A TypeScript/Node.js Express microservice that generates validation reports for ONDC (Open Network for Digital Commerce) protocol compliance testing. The service validates API payloads and transactions across different ONDC domains and generates HTML reports.

## Overview

This service provides:
- Protocol compliance validation for ONDC transactions
- HTML report generation for validation results
- Support for multiple ONDC domains (Logistics, Travel, Retail)
- Utility validation for retail domains
- Debug mode for detailed payload analysis

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd automation-report-service

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

### Environment Variables

See `.env.example` for all available configuration options. Key variables include:

- `VALIDATION_URL`: External validation service URL (defaults to ONDC production)
- `DATA_BASE_URL`: Database service for fetching payloads
- `REDIS_*`: Redis configuration for caching
- `DEBUG_MODE`: Enable debug file generation
- `PORT`: Server port (default: 3000)

## Usage

### Development

```bash
# Run with hot reload
npm run dev

# Run with debug mode
DEBUG_MODE=true npm run dev
# or use the debug script
./run-debug.sh
```

### Production

```bash
# Build TypeScript
npm run build

# Run production server
npm start
```

### Docker

```bash
# Build and run with Docker Compose
docker-compose up --build
```

## API Endpoints

### Generate Report

**POST** `/generate-report`

Generate a validation report for ONDC transactions.

**Headers:**
- `x-api-key`: API authentication key

**Body:**
```json
{
  "sessionId": "string",
  "domain": "ONDC:RET11",
  "version": "1.2.5",
  "flowId": "ORDER_FLOW"
}
```

## Retail Domain Validation

### Overview

Retail domains (ONDC:RET11, RET10, etc.) use external validation services rather than internal validation modules. The service supports utility validation for testing specific retail flows.

### Supported Retail Flows

| Flow ID | Numeric ID | Description |
|---------|------------|-------------|
| FULL_CATALOG | 1 | Full catalog refresh |
| INCREMENTAL_CATALOG | 1 | Incremental catalog updates |
| ORDER_FLOW | 2 | Complete order lifecycle |
| OUT_OF_STOCK | 3 | Out of stock item handling |
| BUYER_CANCEL | 4 | Buyer-initiated cancellation |
| RTO_PLUS_PART_CANCELLATION | 5 | Return to origin with partial cancel |
| RETURN_FLOW | 6 | Product return/liquidation |
| FORCE_CANCEL | 005 | Seller-initiated force cancellation |

### Cancel vs Force Cancel

The service distinguishes between regular and force cancellations:

- **Regular Cancel**: `force: "no"` in descriptor tags
- **Force Cancel**: `force: "yes"` in descriptor tags

Both use the same API endpoint but with different force parameter values.

### Utility Validation

For retail domains, utility validation provides pre-structured test flows:

1. Extracts search/on_search from FULL_CATALOG flow
2. Reuses catalog payloads across all flows
3. Maps payloads based on `context.action` 
4. Handles on_status by fulfillment state

### Custom Validation Service

To use a local or custom validation service:

```bash
# Set in .env
VALIDATION_URL=http://localhost:3008/api/validate
```

The service prioritizes:
1. Environment variable `VALIDATION_URL`
2. Domain-specific URLs from constants
3. Default ONDC production URL

## Debug Mode

Enable debug mode to save detailed payload analysis:

```bash
DEBUG_MODE=true npm run dev
```

Debug files are saved to:
- `/debug/payloads/` - Raw payload data grouped by action
- `/debug/diagnostics/` - Analysis of on_status and cancel payloads
- `/debug/mappings/` - Mapping results and missing payloads
- `/debug/debug_summary.json` - Consolidated summary report

Debug files are automatically ignored by git.

## Domain Support

### Internal Validation Domains
These domains use built-in validation modules:
- ONDC:LOG10, LOG11 (Logistics)
- ONDC:TRV11 (Travel)
- nic2004:60232 (Logistics)

### External Validation Domains
These domains use external validation APIs:
- ONDC:RET10, RET11, RET12, etc. (Retail)
- ONDC:FIS12 (Financial Services)

## Adding New Retail Domains

See [RETAIL_DOMAIN_GUIDE.md](RETAIL_DOMAIN_GUIDE.md) for detailed instructions on:
- Adding new retail domains
- Creating new flows
- Updating flow mappings
- Modifying validation logic

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│   API Request   │────▶│  Report Service  │────▶│  Validation    │
│ /generate-report│     │                  │     │    Service     │
└─────────────────┘     └──────────────────┘     └────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Database API   │
                        │   Redis Cache    │
                        └──────────────────┘
```

## Testing

```bash
# Run tests
npm test
```

Currently includes tests for:
- TRV11 2.0.1 validations

## Troubleshooting

### Socket Hang Up Errors
- Check payload size - large payloads may timeout
- Increase timeout in validateLogs.ts if needed
- Use local validation service for faster response

### Missing Validation Results
- Enable debug mode to see full payloads
- Check if validation service returns only errors
- Verify all required on_status states are present

### Empty Payloads in Validation
- The service now filters empty payloads automatically
- Only payloads with actual data are sent for validation

## Contributing

1. Fork the repository
2. Create your feature branch
3. Run tests and ensure build passes
4. Submit a pull request

## License

[License information]