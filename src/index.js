import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";

const resolver = new Resolver();

/**
 * Get approximate count for a JQL query.
 */
async function getIssueCount(jql) {
  const response = await api.asUser().requestJira(
    route`/rest/api/3/search/approximate-count`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jql }),
    }
  );

  if (!response.ok) {
    throw new Error(`Count API failed: ${response.status}`);
  }

  const data = await response.json();
  return data.count ?? 0;
}

/**
 * Get recent issues for the current project.
 */



async function getRecentIssues(projectKey) {
  const jql = `project = "${projectKey}" AND created >= -90d ORDER BY created DESC`;

  const response = await api.asUser().requestJira(
    route`/rest/api/3/search/jql`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql,
        maxResults: 10,
        fields: [
          "summary",
          "status",
          "priority",
          "assignee",
          "issuetype",
          "created",
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Issue search failed: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();

  return (data.issues ?? []).map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    issueType: issue.fields.issuetype?.name ?? "Unknown",
    status: issue.fields.status?.name ?? "Unknown",
    statusCategory:
      issue.fields.status?.statusCategory?.key ?? "unknown",
    priority: issue.fields.priority?.name ?? "Unassigned",
    assignee: issue.fields.assignee?.displayName ?? "Unassigned",
    created: issue.fields.created,
  }));
}




/**
 * Main dashboard resolver.
 */
resolver.define("getDashboardData", async (req) => {
  try {
    const projectKey = req.context?.extension?.project?.key;

    if (!projectKey) {
      throw new Error("Unable to identify the current Jira project.");
    }

    console.log("Loading IncidentIQ data for:", projectKey);

    const baseJql = `project = "${projectKey}"`;

    const [
      totalIssues,
      criticalIssues,
      openIssues,
      resolvedIssues,
      recentIssues,
    ] = await Promise.all([
      getIssueCount(baseJql),
      getIssueCount(`${baseJql} AND priority = Highest`),
      getIssueCount(`${baseJql} AND resolution IS EMPTY`),
      getIssueCount(`${baseJql} AND resolution IS NOT EMPTY`),
      getRecentIssues(projectKey),
    ]);

    return {
      success: true,
      projectKey,
      stats: {
        totalIssues,
        criticalIssues,
        openIssues,
        resolvedIssues,
      },
      recentIssues,
    };
  } catch (error) {
    console.error("IncidentIQ dashboard error:", error);

    return {
      success: false,
      error: error.message,
    };
  }
});


resolver.define("getLinkedIssues", async (req) => {
  try {
    const issueKey = req.payload?.issueKey;

    if (!issueKey) {
      throw new Error("Issue key is required.");
    }

    const response = await api.asUser().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=issuelinks`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Linked issue search failed: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    const links = data.fields?.issuelinks ?? [];

    const linkedIssues = links.map((link) => {
      const isOutward = Boolean(link.outwardIssue);
      const issue = link.outwardIssue ?? link.inwardIssue;

      return {
        key: issue.key,
        summary: issue.fields?.summary ?? "No summary",
        issueType: issue.fields?.issuetype?.name ?? "Unknown",
        status: issue.fields?.status?.name ?? "Unknown",
        priority: issue.fields?.priority?.name ?? "Unassigned",
        linkType: link.type?.name ?? "Related",
        direction: isOutward ? "outward" : "inward",
      };
    });

    return {
      success: true,
      sourceIssue: issueKey,
      total: linkedIssues.length,
      linkedIssues,
    };
  } catch (error) {
    console.error("Incident correlation error:", error);

    return {
      success: false,
      error: error.message,
    };
  }
});


// ======================================================
// ROVO ACTION: INCIDENT INVESTIGATION
// ======================================================

function extractDescription(description) {
  if (!description) return "";

  if (typeof description === "string") {
    return description;
  }

  const extractText = (node) => {
    if (!node) return "";

    let text = node.text || "";

    if (node.content) {
      text += node.content.map(extractText).join(" ");
    }

    return text;
  };

  return extractText(description).trim();
}

export async function investigateIncidentAction(payload, context) {
  try {
    const issueKey = payload?.issueKey;

    if (
      typeof issueKey !== "string" ||
      !/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)
    ) {
      return {
        success: false,
        error: "A valid Jira issue key is required, for example FI-1.",
      };
    }

    console.log("Rovo investigating incident:", issueKey);

    // Retrieve the incident and its linked issues.
    const response = await api.asUser().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=summary,description,status,priority,issuetype,created,updated,issuelinks`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `Jira API failed: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();
    const fields = data.fields;

    const linkedIssues = (fields.issuelinks || []).map((link) => {
      const isOutward = Boolean(link.outwardIssue);
      const linkedIssue = link.outwardIssue || link.inwardIssue;

      return {
        key: linkedIssue.key,
        summary: linkedIssue.fields?.summary || "No summary",
        issueType: linkedIssue.fields?.issuetype?.name || "Unknown",
        status: linkedIssue.fields?.status?.name || "Unknown",
        priority: linkedIssue.fields?.priority?.name || "Unassigned",
        relationship: link.type?.name || "Related",
        direction: isOutward ? "outward" : "inward",
      };
    });

    const result = {
      success: true,
      incident: {
        key: data.key,
        summary: fields.summary,
        description: extractDescription(fields.description),
        issueType: fields.issuetype?.name || "Unknown",
        status: fields.status?.name || "Unknown",
        priority: fields.priority?.name || "Unassigned",
        created: fields.created,
        updated: fields.updated,
      },
      linkedIssues,
      evidenceCount: linkedIssues.length,
      investigationGuidance: [
        "Analyze the incident description and priority.",
        "Examine linked engineering issues.",
        "Identify possible root causes supported by the retrieved evidence.",
        "Recommend further investigation steps.",
        "Clearly distinguish confirmed facts from hypotheses.",
      ],
    };

    console.log(
      "Rovo investigation completed:",
      issueKey,
      "Linked issues:",
      linkedIssues.length
    );

    return result;

  } catch (error) {
    console.error("Rovo investigation error:", error);

    return {
      success: false,
      error: error.message,
    };
  }
}


export const handler = resolver.getDefinitions();
