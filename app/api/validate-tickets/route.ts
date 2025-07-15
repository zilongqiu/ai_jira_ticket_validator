import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

interface JiraTicket {
  key: string
  summary: string
  description: string
  priority: string
  status: string
  assignee?: string
  reporter: string
  created: string
}

export async function POST(request: NextRequest) {
  try {
    const { tickets, validationRules } = await request.json()

    const validationResults = await Promise.all(
      tickets.map(async (ticket: JiraTicket) => {
        const { text } = await generateText({
          model: openai("gpt-4o-mini"),
          system: `You are an expert Jira ticket validator. Analyze the given ticket against the provided validation rules and return a JSON response with the following structure:
{
  "isValid": boolean,
  "score": number (1-10),
  "issues": ["list of specific issues found"],
  "suggestions": ["list of specific improvement suggestions"]
}

Be thorough in your analysis and provide actionable feedback.`,
          prompt: `
Validation Rules:
${validationRules}

Ticket to validate:
Key: ${ticket.key}
Summary: ${ticket.summary}
Description: ${ticket.description}
Priority: ${ticket.priority}
Status: ${ticket.status}
Reporter: ${ticket.reporter}
Assignee: ${ticket.assignee || "Unassigned"}
Created: ${ticket.created}

Please validate this ticket against the rules and provide detailed feedback.`,
        })

        try {
          const analysis = JSON.parse(text)
          return {
            ticket,
            isValid: analysis.isValid,
            score: analysis.score,
            issues: analysis.issues || [],
            suggestions: analysis.suggestions || [],
          }
        } catch (parseError) {
          // Fallback if JSON parsing fails
          return {
            ticket,
            isValid: false,
            score: 0,
            issues: ["Failed to analyze ticket"],
            suggestions: ["Please try validating again"],
          }
        }
      }),
    )

    return NextResponse.json(validationResults)
  } catch (error) {
    console.error("Error validating tickets:", error)
    return NextResponse.json({ error: "Failed to validate tickets" }, { status: 500 })
  }
}
