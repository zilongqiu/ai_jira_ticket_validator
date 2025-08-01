import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { jiraUrl, jiraUsername, jiraPassword, jiraProject, jqlQuery, maxResults, startAt = 0 } = await request.json() // Added startAt

    // Validate required parameters
    if (!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject) {
      return NextResponse.json(
        { error: "Missing required parameters: jiraUrl, jiraUsername, jiraPassword, or jiraProject" },
        { status: 400 },
      )
    }

    // Clean up the Jira URL (remove trailing slash if present)
    const cleanJiraUrl = jiraUrl.replace(/\/$/, "")

    // Use custom JQL query if provided, otherwise use default
    const jql = jqlQuery && jqlQuery.trim() ? jqlQuery.trim() : `project=${jiraProject} ORDER BY created DESC`

    // Handle maxResults - if "all" is selected, use a very high number (Jira's max is typically 1000)
    const resultsLimit = maxResults === "all" ? 1000 : Number.parseInt(maxResults) || 10

    // Prepare the API endpoint
    const apiUrl = `${cleanJiraUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=${resultsLimit}&startAt=${startAt}&fields=key,summary,description,priority,status,assignee,reporter,created,labels,components`

    // Create authorization header using username:password
    const auth = Buffer.from(`${jiraUsername}:${jiraPassword}`).toString("base64")

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Jira API Error:", response.status, errorText)

      if (response.status === 400) {
        return NextResponse.json(
          { error: "Invalid JQL query. Please check your query syntax and try again." },
          { status: 400 },
        )
      } else if (response.status === 401) {
        return NextResponse.json(
          { error: "Authentication failed. Please check your Jira URL, username, and password." },
          { status: 401 },
        )
      } else if (response.status === 403) {
        return NextResponse.json(
          { error: "Access denied. Please check your permissions for this Jira project." },
          { status: 403 },
        )
      } else if (response.status === 404) {
        return NextResponse.json(
          { error: "Jira instance or project not found. Please check your Jira URL and project key." },
          { status: 404 },
        )
      } else {
        return NextResponse.json(
          { error: `Jira API error: ${response.status} - ${errorText}` },
          { status: response.status },
        )
      }
    }

    const data = await response.json()

    // Transform Jira response to our ticket format
    const tickets = data.issues.map((issue: any) => {
      // Handle different description formats (Atlassian Document Format vs plain text)
      let description = ""
      if (issue.fields.description) {
        if (typeof issue.fields.description === "string") {
          description = issue.fields.description
        } else if (issue.fields.description.content) {
          // Handle Atlassian Document Format
          description = extractTextFromADF(issue.fields.description)
        }
      }

      return {
        key: issue.key,
        summary: issue.fields.summary || "No summary",
        description: description || "No description provided",
        priority: issue.fields.priority?.name || "Unknown",
        status: issue.fields.status?.name || "Unknown",
        assignee: issue.fields.assignee?.displayName || issue.fields.assignee?.name,
        reporter: issue.fields.reporter?.displayName || issue.fields.reporter?.name || "Unknown",
        created: issue.fields.created || new Date().toISOString(),
        labels: issue.fields.labels || [],
        components: issue.fields.components?.map((comp: any) => comp.name) || [],
      }
    })

    const totalAvailable = data.total || tickets.length
    return NextResponse.json({
      tickets,
      total: totalAvailable,
      fetched: tickets.length,
    })
  } catch (error) {
    console.error("Error fetching Jira tickets:", error)
    return NextResponse.json(
      { error: "Failed to fetch tickets. Please check your configuration and try again." },
      { status: 500 },
    )
  }
}

// Helper function to extract text from Atlassian Document Format (ADF)
function extractTextFromADF(adf: any): string {
  if (!adf || !adf.content) return ""

  let text = ""

  function traverse(node: any) {
    if (node.type === "text") {
      text += node.text
    } else if (node.type === "hardBreak") {
      text += "\n"
    } else if (node.content) {
      node.content.forEach(traverse)
    }

    // Add spacing after paragraphs and other block elements
    if (["paragraph", "heading", "bulletList", "orderedList"].includes(node.type)) {
      text += "\n"
    }
  }

  adf.content.forEach(traverse)
  return text.trim()
}
