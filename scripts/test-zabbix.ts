/**
 * Zabbix API exploration script
 * Run: npx tsx scripts/test-zabbix.ts
 * Requires ZABBIX_AUTH_TOKEN in .env.local
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const ZABBIX_URL = process.env.ZABBIX_URL || "http://45.181.126.127:61424/zabbix/api_jsonrpc.php";
const ZABBIX_AUTH_TOKEN = process.env.ZABBIX_AUTH_TOKEN;

// Accept self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

let rpcId = 1;

async function zabbixCall(method: string, params: Record<string, unknown> = {}, requireAuth = true) {
  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
    params,
    id: rpcId++,
  };

  // Zabbix 7.0+ uses Bearer token in HTTP header instead of "auth" in body
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (requireAuth && ZABBIX_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${ZABBIX_AUTH_TOKEN}`;
  }

  const response = await fetch(ZABBIX_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`Zabbix Error: ${json.error.message} - ${JSON.stringify(json.error.data)}`);
  }

  return json.result;
}

function separator(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`  ${title}`);
  console.log("=".repeat(80) + "\n");
}

async function main() {
  console.log(`Zabbix URL: ${ZABBIX_URL}`);
  console.log(`Auth Token: ${ZABBIX_AUTH_TOKEN ? ZABBIX_AUTH_TOKEN.substring(0, 8) + "..." : "NOT SET"}`);

  // 1. API Version (no auth required)
  separator("1. API VERSION (sin auth)");
  try {
    const version = await zabbixCall("apiinfo.version", {}, false);
    console.log("Zabbix version:", version);
  } catch (err) {
    console.error("ERROR:", err);
  }

  if (!ZABBIX_AUTH_TOKEN) {
    console.error("\n❌ ZABBIX_AUTH_TOKEN no está configurado en .env.local");
    process.exit(1);
  }

  // 2. All hosts with interfaces
  separator("2. HOSTS (host.get con interfaces)");
  try {
    const hosts = await zabbixCall("host.get", {
      output: "extend",
      selectInterfaces: "extend",
      selectHostGroups: ["groupid", "name"],  // Zabbix 7.x: selectHostGroups (not selectGroups)
      selectTags: ["tag", "value"],
    });
    console.log(`Total hosts: ${hosts.length}\n`);
    for (const host of hosts) {
      console.log(`  [${host.hostid}] ${host.name} (host: ${host.host})`);
      console.log(`    status: ${host.status === "0" ? "ENABLED" : "DISABLED"}, available: ${host.available === "1" ? "UP" : host.available === "2" ? "DOWN" : "UNKNOWN"}`);
      console.log(`    error: ${host.error || "(none)"}`);
      console.log(`    groups: ${host.hostgroups?.map((g: any) => g.name).join(", ") || "(none)"}`);
      console.log(`    tags: ${host.tags?.map((t: any) => `${t.tag}=${t.value}`).join(", ") || "(none)"}`);
      if (host.interfaces?.length) {
        for (const iface of host.interfaces) {
          console.log(`    interface: type=${iface.type} ip=${iface.ip} port=${iface.port} main=${iface.main}`);
        }
      }
      console.log();
    }
  } catch (err) {
    console.error("ERROR:", err);
  }

  // 3. Host groups
  separator("3. HOST GROUPS (hostgroup.get)");
  try {
    const groups = await zabbixCall("hostgroup.get", {
      output: "extend",
      selectHosts: ["hostid", "name"],
    });
    console.log(`Total groups: ${groups.length}\n`);
    for (const group of groups) {
      const hostNames = group.hosts?.map((h: any) => h.name).join(", ") || "(empty)";
      console.log(`  [${group.groupid}] ${group.name} — hosts: ${hostNames}`);
    }
  } catch (err) {
    console.error("ERROR:", err);
  }

  // 4. Active triggers (problems)
  separator("4. ACTIVE TRIGGERS (trigger.get only_true=1)");
  try {
    const triggers = await zabbixCall("trigger.get", {
      output: ["triggerid", "description", "priority", "value", "lastchange", "error"],
      selectHosts: ["hostid", "name"],
      only_true: 1,
      sortfield: "priority",
      sortorder: "DESC",
      limit: 50,
    });
    console.log(`Active triggers: ${triggers.length}\n`);
    const priorityLabels: Record<string, string> = {
      "0": "Not classified", "1": "Information", "2": "Warning",
      "3": "Average", "4": "High", "5": "Disaster",
    };
    for (const t of triggers) {
      const hostName = t.hosts?.[0]?.name || "?";
      const changed = new Date(parseInt(t.lastchange) * 1000).toLocaleString("es-VE");
      console.log(`  [${t.triggerid}] [${priorityLabels[t.priority] || t.priority}] ${t.description}`);
      console.log(`    host: ${hostName}, lastchange: ${changed}`);
      if (t.error) console.log(`    error: ${t.error}`);
      console.log();
    }
  } catch (err) {
    console.error("ERROR:", err);
  }

  // 5. Items for first host
  separator("5. ITEMS (item.get — primeros hosts)");
  try {
    // Get first 3 hosts
    const hosts = await zabbixCall("host.get", {
      output: ["hostid", "name"],
      limit: 3,
    });

    for (const host of hosts) {
      console.log(`\n--- Items for ${host.name} (${host.hostid}) ---`);
      const items = await zabbixCall("item.get", {
        output: ["itemid", "name", "key_", "lastvalue", "lastclock", "units", "state", "status"],
        hostids: [host.hostid],
        sortfield: "name",
        limit: 30,
      });
      console.log(`  Total items (showing first 30): ${items.length}\n`);
      for (const item of items) {
        const stateLabel = item.state === "0" ? "OK" : "NOT_SUPPORTED";
        const lastUpdate = item.lastclock !== "0" ? new Date(parseInt(item.lastclock) * 1000).toLocaleString("es-VE") : "never";
        console.log(`  [${item.itemid}] ${item.name}`);
        console.log(`    key: ${item.key_}`);
        console.log(`    value: ${item.lastvalue} ${item.units || ""} (state: ${stateLabel}, updated: ${lastUpdate})`);
      }
    }
  } catch (err) {
    console.error("ERROR:", err);
  }

  // 6. Recent problems
  separator("6. RECENT PROBLEMS (problem.get)");
  try {
    // Zabbix 7.x: problem.get doesn't support selectHosts
    const problems = await zabbixCall("problem.get", {
      output: "extend",
      selectTags: ["tag", "value"],
      recent: true,
      sortfield: ["eventid"],
      sortorder: "DESC",
      limit: 30,
    });
    console.log(`Recent problems: ${problems.length}\n`);
    const severityLabels: Record<string, string> = {
      "0": "Not classified", "1": "Information", "2": "Warning",
      "3": "Average", "4": "High", "5": "Disaster",
    };
    for (const p of problems) {
      const started = new Date(parseInt(p.clock) * 1000).toLocaleString("es-VE");
      const ack = p.acknowledged === "1" ? "ACK" : "UNACK";
      console.log(`  [${p.eventid}] [${severityLabels[p.severity] || p.severity}] ${p.name}`);
      console.log(`    objectid: ${p.objectid}, started: ${started}, ${ack}`);
      if (p.tags?.length) {
        console.log(`    tags: ${p.tags.map((t: any) => `${t.tag}=${t.value}`).join(", ")}`);
      }
      console.log();
    }
  } catch (err) {
    console.error("ERROR:", err);
  }

  console.log("\n✅ Test completo");
}

main().catch(console.error);
