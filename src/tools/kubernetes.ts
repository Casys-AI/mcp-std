/**
 * Kubernetes tools - cluster management
 *
 * @module lib/std/tools/kubernetes
 */

import { type MiniTool, runCommand } from "./common.ts";

export const kubernetesTools: MiniTool[] = [
  {
    name: "kubectl_get",
    description:
      "List and retrieve Kubernetes resources (pods, services, deployments, configmaps, secrets, etc.). Query by name, namespace, or label selector. Get detailed resource status, configuration, and metadata. Use for cluster monitoring, debugging, or resource inspection. Keywords: kubectl get, kubernetes resources, list pods, get services, k8s objects, cluster state.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          description: "Resource type (pods, services, deployments, etc.)",
        },
        name: { type: "string", description: "Resource name (optional)" },
        namespace: { type: "string", description: "Namespace" },
        output: {
          type: "string",
          enum: ["json", "yaml", "wide", "name"],
          description: "Output format",
        },
        selector: { type: "string", description: "Label selector" },
        allNamespaces: { type: "boolean", description: "All namespaces" },
      },
      required: ["resource"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/table-viewer",
        emits: ["select", "describe", "delete"],
        accepts: ["filter", "namespace"],
      },
    },
    handler: async (
      { resource, name, namespace, output = "json", selector, allNamespaces = false },
    ) => {
      const args = ["get", resource as string];
      if (name) args.push(name as string);
      if (namespace) args.push("-n", namespace as string);
      if (allNamespaces) args.push("-A");
      if (selector) args.push("-l", selector as string);
      args.push("-o", output as string);

      const result = await runCommand("kubectl", args);
      if (result.code !== 0) {
        throw new Error(`kubectl get failed: ${result.stderr}`);
      }

      if (output === "json") {
        try {
          return JSON.parse(result.stdout);
        } catch {
          return { output: result.stdout };
        }
      }
      return { output: result.stdout };
    },
  },
  {
    name: "kubectl_apply",
    description:
      "Apply Kubernetes manifests to create or update resources. Deploy applications, services, configmaps from YAML/JSON files. Supports dry-run for validation. Use for deployments, infrastructure-as-code, GitOps workflows. Keywords: kubectl apply, deploy kubernetes, k8s manifest, create resource, update deployment, kubernetes yaml.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Manifest file path" },
        namespace: { type: "string", description: "Namespace" },
        dryRun: { type: "boolean", description: "Dry run (client or server)" },
      },
      required: ["file"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["click", "viewOutput"],
        accepts: [],
      },
    },
    handler: async ({ file, namespace, dryRun = false }) => {
      const args = ["apply", "-f", file as string];
      if (namespace) args.push("-n", namespace as string);
      if (dryRun) args.push("--dry-run=client");

      const result = await runCommand("kubectl", args);
      if (result.code !== 0) {
        throw new Error(`kubectl apply failed: ${result.stderr}`);
      }
      return { success: true, output: result.stdout };
    },
  },
  {
    name: "kubectl_logs",
    description:
      "Fetch logs from Kubernetes pods for debugging and monitoring. View container stdout/stderr, filter by time, tail recent lines, or stream live. Essential for troubleshooting pod issues, application debugging, and monitoring. Keywords: kubectl logs, pod logs, container output, k8s debugging, application logs, stream logs.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pod: { type: "string", description: "Pod name" },
        namespace: { type: "string", description: "Namespace" },
        container: { type: "string", description: "Container name" },
        tail: { type: "number", description: "Lines to show from end" },
        since: { type: "string", description: "Show logs since (e.g., '1h', '10m')" },
        follow: { type: "boolean", description: "Follow logs (stream)" },
      },
      required: ["pod"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/log-viewer",
        emits: ["search", "filter", "copy"],
        accepts: ["filter", "tail", "refresh"],
      },
    },
    handler: async ({ pod, namespace, container, tail, since, follow }) => {
      const args = ["logs", pod as string];
      if (namespace) args.push("-n", namespace as string);
      if (container) args.push("-c", container as string);
      if (tail) args.push("--tail", String(tail));
      if (since) args.push("--since", since as string);
      if (follow) args.push("-f");

      const result = await runCommand("kubectl", args, { timeout: 60000 });
      return { logs: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: "kubectl_exec",
    description:
      "Execute commands inside running Kubernetes pods. Run shell commands, debug containers, inspect filesystem, or troubleshoot applications directly. Essential for container debugging and interactive troubleshooting. Keywords: kubectl exec, pod shell, container exec, run command in pod, k8s debugging, interactive container.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        pod: { type: "string", description: "Pod name" },
        command: { type: "string", description: "Command to execute" },
        namespace: { type: "string", description: "Namespace" },
        container: { type: "string", description: "Container name" },
      },
      required: ["pod", "command"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/log-viewer",
        emits: ["copy"],
        accepts: [],
      },
    },
    handler: async ({ pod, command, namespace, container }) => {
      const args = ["exec", pod as string];
      if (namespace) args.push("-n", namespace as string);
      if (container) args.push("-c", container as string);
      args.push("--", "sh", "-c", command as string);

      const result = await runCommand("kubectl", args, { timeout: 60000 });
      return {
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },
  },
  {
    name: "kubectl_describe",
    description:
      "Get detailed information about a Kubernetes resource. Shows events, conditions, annotations, labels, and full configuration. Essential for debugging resource issues, understanding pod failures, or inspecting resource state. Keywords: kubectl describe, resource details, pod events, k8s debugging, resource inspection, kubernetes troubleshooting.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          description:
            "Resource type (pod, deployment, service, node, configmap, secret, ingress, etc.)",
        },
        name: {
          type: "string",
          description: "Resource name",
        },
        namespace: {
          type: "string",
          description: "Namespace (default: 'default')",
        },
        context: {
          type: "string",
          description: "Kubectl context to use",
        },
      },
      required: ["resource", "name"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/yaml-viewer",
        emits: ["copy", "search"],
        accepts: ["refresh"],
      },
    },
    handler: async ({ resource, name, namespace = "default", context }) => {
      const args = ["describe", resource as string, name as string];
      args.push("-n", namespace as string);
      if (context) args.push("--context", context as string);

      const result = await runCommand("kubectl", args);
      if (result.code !== 0) {
        throw new Error(`kubectl describe failed: ${result.stderr}`);
      }

      return {
        resource: resource as string,
        name: name as string,
        namespace: namespace as string,
        description: result.stdout,
      };
    },
  },
  {
    name: "kubectl_events",
    description:
      "List Kubernetes events for monitoring and troubleshooting. Events show what's happening in the cluster: pod scheduling, image pulls, container starts, failures, and warnings. Filter by namespace, resource, or event type. Essential for debugging deployments and understanding cluster activity. Keywords: kubectl events, kubernetes events, pod events, cluster events, k8s troubleshooting, event timeline, warning events.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description:
            "Namespace to query (default: 'default'). Use '--all-namespaces' or leave empty with allNamespaces=true for all.",
        },
        resourceName: {
          type: "string",
          description:
            "Filter events by involved resource name (e.g., pod name, deployment name)",
        },
        types: {
          type: "array",
          items: { type: "string" },
          description:
            "Filter by event types: 'Normal', 'Warning'. If empty, returns all types.",
        },
        limit: {
          type: "number",
          description: "Maximum number of events to return (default: 100)",
        },
        context: {
          type: "string",
          description: "Kubectl context to use",
        },
        allNamespaces: {
          type: "boolean",
          description: "Query events across all namespaces",
        },
      },
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/timeline-viewer",
        emits: ["select", "filter", "describe"],
        accepts: ["filter", "namespace", "types"],
      },
    },
    handler: async ({
      namespace = "default",
      resourceName,
      types,
      limit = 100,
      context,
      allNamespaces = false,
    }) => {
      const args = ["get", "events", "-o", "json"];

      if (allNamespaces) {
        args.push("-A");
      } else if (namespace) {
        args.push("-n", namespace as string);
      }

      if (context) {
        args.push("--context", context as string);
      }

      const result = await runCommand("kubectl", args);
      if (result.code !== 0) {
        throw new Error(`kubectl get events failed: ${result.stderr}`);
      }

      let eventsData: { items?: unknown[] };
      try {
        eventsData = JSON.parse(result.stdout);
      } catch {
        throw new Error(`Failed to parse kubectl events output: ${result.stdout}`);
      }

      const rawEvents = eventsData.items || [];

      // Filter and transform events to TimelineEvent format
      interface KubeEvent {
        lastTimestamp?: string;
        eventTime?: string;
        firstTimestamp?: string;
        type?: string;
        reason?: string;
        message?: string;
        involvedObject?: {
          name?: string;
          namespace?: string;
          kind?: string;
        };
        count?: number;
        metadata?: {
          namespace?: string;
        };
      }

      const filteredEvents = (rawEvents as KubeEvent[]).filter((event) => {
        // Filter by resource name if specified
        if (resourceName && event.involvedObject?.name !== resourceName) {
          return false;
        }

        // Filter by event types if specified
        if (
          types &&
          Array.isArray(types) &&
          types.length > 0 &&
          !types.includes(event.type as string)
        ) {
          return false;
        }

        return true;
      });

      // Sort by timestamp (most recent first)
      filteredEvents.sort((a, b) => {
        const timeA = a.lastTimestamp || a.eventTime || a.firstTimestamp || "";
        const timeB = b.lastTimestamp || b.eventTime || b.firstTimestamp || "";
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      // Apply limit
      const limitedEvents = filteredEvents.slice(0, limit as number);

      // Map Kubernetes event type to timeline type
      const mapEventType = (kubeType?: string): "info" | "warning" | "success" => {
        switch (kubeType) {
          case "Warning":
            return "warning";
          case "Normal":
            return "success";
          default:
            return "info";
        }
      };

      // Transform to TimelineEvent format
      const events = limitedEvents.map((event) => ({
        timestamp:
          event.lastTimestamp ||
          event.eventTime ||
          event.firstTimestamp ||
          new Date().toISOString(),
        type: mapEventType(event.type),
        title: event.reason || "Unknown",
        description: event.message || "",
        source: event.involvedObject?.name || "unknown",
        metadata: {
          namespace:
            event.involvedObject?.namespace ||
            event.metadata?.namespace ||
            "default",
          kind: event.involvedObject?.kind || "Unknown",
          count: event.count || 1,
        },
      }));

      return { events };
    },
  },
  {
    name: "kubectl_top",
    description:
      "Get resource usage (CPU/memory) for pods or nodes. Shows real-time resource consumption metrics from the Kubernetes metrics server. Essential for capacity planning, identifying resource-hungry pods, and performance monitoring. Keywords: kubectl top, resource usage, cpu memory, pod metrics, node metrics, kubernetes monitoring, resource consumption.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "string",
          enum: ["pods", "nodes"],
          description: "Resource type to get metrics for (pods or nodes)",
        },
        namespace: {
          type: "string",
          description: "Namespace (only applicable for pods)",
        },
        context: {
          type: "string",
          description: "Kubectl context to use",
        },
      },
      required: ["resource"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/metrics-panel",
        emits: ["select", "refresh"],
        accepts: ["filter", "namespace"],
      },
    },
    handler: async ({ resource, namespace, context }) => {
      const args = ["top", resource as string];
      if (namespace && resource === "pods") {
        args.push("-n", namespace as string);
      }
      if (context) {
        args.push("--context", context as string);
      }

      const result = await runCommand("kubectl", args);
      if (result.code !== 0) {
        throw new Error(`kubectl top failed: ${result.stderr}`);
      }

      // Parse the output into structured data
      const lines = result.stdout.trim().split("\n");
      if (lines.length === 0) {
        return { metrics: [], raw: result.stdout };
      }

      const headers = lines[0].split(/\s+/);
      const metrics = lines.slice(1).map((line) => {
        const values = line.split(/\s+/);
        const entry: Record<string, string> = {};
        headers.forEach((header, i) => {
          entry[header.toLowerCase()] = values[i] || "";
        });
        return entry;
      });

      return {
        resource: resource as string,
        namespace: namespace as string | undefined,
        metrics,
        raw: result.stdout,
      };
    },
  },
  {
    name: "kubectl_rollout_status",
    description:
      "Get rollout status of a deployment. Monitor deployment progress, check if a rollout has completed successfully, or diagnose stuck deployments. Essential for CI/CD pipelines and deployment verification. Keywords: kubectl rollout status, deployment status, rollout progress, deployment verification, k8s deploy, kubernetes rollout.",
    category: "system",
    inputSchema: {
      type: "object",
      properties: {
        deployment: {
          type: "string",
          description: "Deployment name",
        },
        namespace: {
          type: "string",
          description: "Namespace (default: 'default')",
        },
        context: {
          type: "string",
          description: "Kubectl context to use",
        },
      },
      required: ["deployment"],
    },
    _meta: {
      ui: {
        resourceUri: "ui://mcp-std/status-badge",
        emits: ["click", "refresh"],
        accepts: ["refresh"],
      },
    },
    handler: async ({ deployment, namespace = "default", context }) => {
      const args = ["rollout", "status", `deployment/${deployment}`];
      args.push("-n", namespace as string);
      if (context) {
        args.push("--context", context as string);
      }

      const result = await runCommand("kubectl", args, { timeout: 120000 });

      // Determine status based on output
      const isComplete = result.code === 0 &&
        result.stdout.includes("successfully rolled out");
      const isWaiting = result.stdout.includes("Waiting for");

      return {
        deployment: deployment as string,
        namespace: namespace as string,
        success: result.code === 0,
        complete: isComplete,
        waiting: isWaiting,
        message: result.stdout.trim(),
        stderr: result.stderr,
      };
    },
  },
];
