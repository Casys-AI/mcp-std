# Casys PML Monitoring Stack

Observability stack with Grafana, Loki, Prometheus, and Promtail.

## Quick Start

```bash
# Start the monitoring stack
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop stack
docker-compose down
```

## Services

### 🎨 Grafana - http://localhost:3000

**Default credentials:** `admin` / `admin`

Unified dashboard for logs, metrics, and visualization.

### 📝 Loki - http://localhost:3100

Log aggregation system. Automatically receives logs from Promtail.

### 📈 Prometheus - http://localhost:9090

Metrics collection and time-series database.

### 🚚 Promtail

Log shipper that reads Casys PML logs and sends them to Loki.

**Monitored logs:** `/home/ubuntu/.pml/logs/*.log`

## Usage

### Viewing Logs in Grafana

1. Open http://localhost:3000
2. Go to **Explore** (compass icon)
3. Select **Loki** datasource
4. Query examples:
   ```logql
   {job="pml"}
   {job="pml", level="ERROR"}
   {job="pml"} |= "Sentry"
   {job="pml"} | json | level="INFO"
   ```

### Creating Dashboards

1. Go to **Dashboards** → **New Dashboard**
2. Add panels with queries:
   - **Log panel:** `{job="pml"}`
   - **Error count:** `count_over_time({job="pml", level="ERROR"}[5m])`
   - **Request rate:** `rate({job="pml"} |= "call_tool"[1m])`

### Metrics (Future)

When Prometheus exporter is added:

- `pml_mcp_requests_total`
- `pml_mcp_request_duration_seconds`
- `pml_tools_called_total`

## Configuration Files

- `loki-config.yaml` - Loki server config
- `promtail-config.yaml` - Log scraping config
- `prometheus.yml` - Metrics scraping config
- `grafana/provisioning/` - Auto-provisioned datasources

## Retention

- **Logs:** 31 days (configured in `loki-config.yaml`)
- **Metrics:** 15 days (Prometheus default)

## Troubleshooting

### Logs not appearing in Grafana

```bash
# Check Promtail is reading logs
docker-compose logs promtail

# Check Loki is receiving data
curl http://localhost:3100/ready

# Verify log file permissions
ls -la /home/ubuntu/.pml/logs/
```

### High memory usage

Adjust retention in `loki-config.yaml`:

```yaml
limits_config:
  retention_period: 168h # 7 days instead of 31
```

## Next Steps

1. Add Prometheus exporter to Casys PML
2. Create custom dashboards
3. Set up alerting rules
4. Add Tempo for distributed tracing (optional)
