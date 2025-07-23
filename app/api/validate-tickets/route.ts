import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { ValidationHistoryManager } from "@/lib/validation-history"

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

interface FieldValidationRequest {
  ticket: JiraTicket
  fieldsToValidate: string[]
  validationRules: string
  productRequirements?: string
}

export async function POST(request: NextRequest) {
  try {
    const { tickets, validationRules, productRequirements, fieldsToValidate } = await request.json()

    // Handle both full ticket validation and field-specific validation
    const isFieldSpecific = fieldsToValidate && Array.isArray(fieldsToValidate)

    const validationResults = await Promise.all(
      tickets.map(async (ticket: JiraTicket) => {
        if (isFieldSpecific) {
          // Field-specific validation
          return await validateSpecificFields(ticket, fieldsToValidate, validationRules, productRequirements)
        } else {
          // Full ticket validation (legacy support)
          return await validateFullTicket(ticket, validationRules, productRequirements)
        }
      }),
    )

    return NextResponse.json(validationResults)
  } catch (error) {
    console.error("Error validating tickets:", error)
    return NextResponse.json({ error: "Failed to validate tickets" }, { status: 500 })
  }
}

async function validateSpecificFields(
  ticket: JiraTicket,
  fieldsToValidate: string[],
  validationRules: string,
  productRequirements?: string,
) {
  // Get previous history for context
  const previousHistory = ValidationHistoryManager.getTicketHistory(ticket.key)

  const fieldResults = await Promise.all(
    fieldsToValidate.map(async (fieldName) => {
      const fieldValue = getFieldValue(ticket, fieldName)
      const fieldRules = extractFieldRules(validationRules, fieldName)

      // Get previous feedback for this specific field
      const previousFieldResult = previousHistory?.fieldResults?.find((f) => f.field === fieldName)
      const previousFeedbackSection = previousFieldResult
        ? `
**Previous Validation History for ${fieldName}:**
- Previous Score: ${previousFieldResult.score}/10
- Previous Issues: ${previousFieldResult.issues.join("; ")}
- Previous Suggestions: ${previousFieldResult.suggestions.join("; ")}
- Last Validated: ${new Date(previousFieldResult.lastValidated).toLocaleDateString()}

**IMPORTANT:** Avoid repeating similar issues or suggestions unless the field still has the same problems. Focus on new issues or acknowledge improvements made since last validation.`
        : ""

      const { text } = await generateText({
        model: openai("gpt-4"),
        system: `You are a precise field-specific Jira validator with historical context awareness. Analyze ONLY the specified field against its specific rules.

**CRITICAL INSTRUCTIONS:**
1. **Single Field Focus**: Only validate the specified field, ignore other fields
2. **Specific & Measurable**: Only flag violations of explicit, quantifiable rules
3. **Context Aware**: Consider field type and ticket context
4. **No Cross-Field Issues**: Don't reference other fields in issues/suggestions
5. **Historical Awareness**: Use previous validation history to avoid repetitive feedback
6. **Evolution Recognition**: Acknowledge improvements or deteriorations since last validation
7. **Fresh Perspective**: If previous issues are resolved, focus on new potential improvements

**SCORING GUIDELINES:**
- If field has improved since last validation, acknowledge the improvement
- If same issues persist, mention they are still unresolved
- Be more lenient if clear improvements have been made
- Focus on the most impactful issues rather than minor nitpicks

Return JSON:
{
  "score": number (1-10),
  "issues": ["specific violations for this field only"],
  "suggestions": ["specific fixes for this field only"]
}`,
        prompt: `
Field to validate: ${fieldName}
Field value: ${fieldValue}
Field-specific rules: ${fieldRules}
${productRequirements ? `Product Requirements: ${productRequirements}` : ""}
${previousFeedbackSection}

Ticket context:
Key: ${ticket.key}
Type: ${inferTicketType(ticket)}

Validate ONLY the ${fieldName} field against its specific rules, considering any previous validation history.`,
      })

      try {
        const analysis = JSON.parse(text)
        return {
          field: fieldName,
          score: analysis.score,
          issues: analysis.issues || [],
          suggestions: analysis.suggestions || [],
          lastValidated: new Date().toISOString(),
        }
      } catch (parseError) {
        return {
          field: fieldName,
          score: 0,
          issues: [`Failed to analyze ${fieldName} field`],
          suggestions: [`Re-validate ${fieldName} field`],
          lastValidated: new Date().toISOString(),
        }
      }
    }),
  )

  // Calculate overall scores
  const overallScore = Math.floor(fieldResults.reduce((sum, field) => sum + field.score, 0) / fieldResults.length)

  return {
    ticket,
    score: overallScore,
    issues: fieldResults.flatMap((f) => f.issues),
    suggestions: fieldResults.flatMap((f) => f.suggestions),
    fieldResults,
    validationType: "field-specific",
  }
}

async function validateFullTicket(ticket: JiraTicket, validationRules: string, productRequirements?: string) {
  const productRequirementsSection = productRequirements ? `Product Requirements: ${productRequirements}` : ""
  const validationInstruction = productRequirements ? "rules and product requirements" : "rules"

  // Get previous history for context
  const previousHistory = ValidationHistoryManager.getTicketHistory(ticket.key)
  const previousValidationSection = previousHistory
    ? `
**Previous Validation History:**
- Previous Overall Score: ${previousHistory.score}/10
- Previous Validation Date: ${new Date(previousHistory.timestamp).toLocaleDateString()}
- Previous Issues: ${previousHistory.issues.join("; ")}
- Previous Suggestions: ${previousHistory.suggestions.join("; ")}

**Field-by-Field Previous Results:**
${previousHistory.fieldResults
  ?.map(
    (f) => `
- ${f.field}: Score ${f.score}/10
  Issues: ${f.issues.join("; ") || "None"}
  Suggestions: ${f.suggestions.join("; ") || "None"}`,
  )
  .join("")}

**IMPORTANT:** Use this history to:
1. Avoid repeating similar issues/suggestions unless problems persist
2. Acknowledge improvements made since last validation
3. Focus on new issues or areas that need attention
4. Adjust scoring based on progress made`
    : ""

  const { text } = await generateText({
    model: openai("gpt-4"),
    system: `You are a precise Jira ticket validator with historical context awareness. You must analyze tickets against SPECIFIC, MEASURABLE criteria only.

**CRITICAL INSTRUCTIONS:**
1. **Be Specific & Measurable**: Only flag issues that violate specific, quantifiable rules
2. **Avoid Subjective Judgments**: Do not suggest improvements unless they violate specific criteria
3. **Check Actual Content**: Verify sections don't exist with different wording before flagging as missing
4. **One Issue Per Field**: If a field meets requirements, don't suggest additional improvements
5. **Context Awareness**: Consider ticket type when applying rules
${previousHistory ? 
"6. **Historical Intelligence**: Use previous validation history to provide better feedback\n" +
"7. **Acknowledge Progress**: Recognize improvements made since last validation\n" +
"8. **Fresh Insights**: Focus on new issues rather than repeating old feedback" : ""
}


**SCORING GUIDELINES:**
- 9-10: Meets all specific criteria perfectly without any issue
- 7-8: Minor violations of 1-2 non-critical criteria  
- 5-6: Missing 1-2 required elements
- 3-4: Multiple missing required elements
- 1-2: Severely incomplete or violates multiple critical criteria
${previousHistory ? 
"- **Bonus consideration**: If ticket has improved since last validation, be more generous with scoring\n" +
"- **Penalty consideration**: If same issues persist from previous validation, be more critical" : ""
}

Return JSON with field-level breakdown:
{
  "score": number (1-10),
  "issues": ["specific rule violations only"],
  "suggestions": ["specific, actionable fixes only"],
  "fieldResults": [
    {
      "field": "summary|description|priority|status|assignee",
      "score": number,
      "issues": ["field-specific issues"],
      "suggestions": ["field-specific suggestions"],
      "lastValidated": "ISO timestamp"
    }
  ]
}`,
    prompt: `
Validation Rules: ${validationRules}
${productRequirementsSection}
${previousValidationSection}

Ticket: ${ticket.key}
Summary: ${ticket.summary}
Description: ${ticket.description}
Priority: ${ticket.priority}
Status: ${ticket.status}
Reporter: ${ticket.reporter}
Assignee: ${ticket.assignee || "Unassigned"}

Analyze against ${validationInstruction} ${previousHistory ? "with historical context" : ""}. Provide both overall and field-level results.`,
  })

  try {
    const analysis = JSON.parse(text)
    return {
      ticket,
      score: analysis.score,
      issues: analysis.issues || [],
      suggestions: analysis.suggestions || [],
      fieldResults: analysis.fieldResults || [],
      validationType: "full",
    }
  } catch (parseError) {
    return {
      ticket,
      score: 0,
      issues: ["Failed to analyze ticket - please try again"],
      suggestions: ["Re-run validation to get proper analysis"],
      fieldResults: [],
      validationType: "full",
    }
  }
}

function getFieldValue(ticket: JiraTicket, fieldName: string): string {
  switch (fieldName) {
    case "summary":
      return ticket.summary
    case "description":
      return ticket.description
    case "priority":
      return ticket.priority
    case "status":
      return ticket.status
    case "assignee":
      return ticket.assignee || "Unassigned"
    case "reporter":
      return ticket.reporter
    default:
      return ""
  }
}

function extractFieldRules(validationRules: string, fieldName: string): string {
  const lines = validationRules.split("\n")
  const fieldSection = lines.find(
    (line) =>
      line.toLowerCase().includes(fieldName.toLowerCase()) ||
      (fieldName === "summary" && line.toLowerCase().includes("title")),
  )

  if (!fieldSection) return validationRules // Return all rules if specific section not found

  // Extract rules for this field (simple implementation)
  const sectionStart = lines.indexOf(fieldSection)
  const nextSectionStart = lines.findIndex(
    (line, index) => index > sectionStart && line.startsWith("**") && line.includes(":"),
  )

  const sectionEnd = nextSectionStart === -1 ? lines.length : nextSectionStart
  return lines.slice(sectionStart, sectionEnd).join("\n")
}

function inferTicketType(ticket: JiraTicket): string {
  const summary = ticket.summary.toLowerCase()
  const description = ticket.description.toLowerCase()

  if (summary.includes("bug") || summary.includes("fix") || description.includes("reproduce")) {
    return "bug"
  } else if (summary.includes("feature") || summary.includes("add") || description.includes("user story")) {
    return "feature"
  } else {
    return "task"
  }
}
