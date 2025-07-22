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
    const { tickets, validationRules, productRequirements } = await request.json()

    const validationResults = await Promise.all(
      tickets.map(async (ticket: JiraTicket) => {
        const productRequirementsSection = productRequirements
          ? `
Product Requirements:
${productRequirements}`
          : ""

        const validationInstruction = productRequirements ? "rules and product requirements" : "rules"

        const { text } = await generateText({
          model: openai("gpt-4"),
          system: `You are a precise Jira ticket validator. You must analyze tickets against SPECIFIC, MEASURABLE criteria only.

**CRITICAL INSTRUCTIONS:**
1. **Be Specific & Measurable**: Only flag issues that violate specific, quantifiable rules (character counts, required sections, etc.)
2. **Avoid Subjective Judgments**: Do not suggest improvements for "clarity" or "better descriptions" unless they violate specific criteria
3. **Check Actual Content**: Before flagging missing sections, verify they don't exist with different wording (e.g., "Acceptance Criteria" vs "AC" vs "Requirements")
4. **One Issue Per Field**: If a field meets the basic requirements, don't suggest additional improvements
5. **Context Awareness**: Consider the ticket type (bug vs feature vs task) when applying rules

**VALIDATION APPROACH:**
- Title: Check length (10-80 chars), format, specificity
- Description: Check length (50+ chars), required sections based on ticket type
- Priority: Validate against severity criteria
- Status/Assignment: Check logical consistency
- Only flag CLEAR violations of stated rules

**SCORING GUIDELINES:**
- 9-10: Meets all specific criteria perfectly
- 7-8: Minor violations of 1-2 non-critical criteria  
- 5-6: Missing 1-2 required elements
- 3-4: Multiple missing required elements
- 1-2: Severely incomplete or violates multiple critical criteria

Return JSON:
{
  "isValid": boolean,
  "score": number (1-10),
  "issues": ["specific rule violations only"],
  "suggestions": ["specific, actionable fixes for violations only which fulfill ALL above VALIDATION APPROACH defined"]
}`,
          prompt: `
Validation Rules:
${validationRules}
${productRequirementsSection}

Ticket to validate:
Key: ${ticket.key}
Summary: ${ticket.summary}
Description: ${ticket.description}
Priority: ${ticket.priority}
Status: ${ticket.status}
Reporter: ${ticket.reporter}
Assignee: ${ticket.assignee || "Unassigned"}
Created: ${ticket.created}

Analyze this ticket against the specific ${validationInstruction}. Only report violations of explicit criteria. Do not suggest improvements for fields that meet the minimum requirements.`,
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
            issues: ["Failed to analyze ticket - please try again"],
            suggestions: ["Re-run validation to get proper analysis"],
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
