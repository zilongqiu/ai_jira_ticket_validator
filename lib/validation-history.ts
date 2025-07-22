interface TicketSnapshot {
    key: string
    summary: string
    description: string
    priority: string
    status: string
    assignee?: string
    reporter: string
    created: string
}

interface FieldValidationResult {
    field: string
    isValid: boolean
    score: number
    issues: string[]
    suggestions: string[]
    lastValidated: string
}

interface ValidationHistoryEntry {
    ticketKey: string
    snapshot: TicketSnapshot
    fieldResults: FieldValidationResult[]
    overallScore: number
    isValid: boolean
    timestamp: string
}

export class ValidationHistoryManager {
    private static STORAGE_KEY = "jira-validation-history"

    static getHistory(): ValidationHistoryEntry[] {
        if (typeof window === "undefined") return []
        const stored = localStorage.getItem(this.STORAGE_KEY)
        return stored ? JSON.parse(stored) : []
    }

    static saveHistory(history: ValidationHistoryEntry[]): void {
        if (typeof window === "undefined") return
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history))
    }

    static getTicketHistory(ticketKey: string): ValidationHistoryEntry | null {
        const history = this.getHistory()
        return history.find((entry) => entry.ticketKey === ticketKey) || null
    }

    static detectChangedFields(current: TicketSnapshot, previous: TicketSnapshot): string[] {
        const changedFields: string[] = []

        if (current.summary !== previous.summary) changedFields.push("summary")
        if (current.description !== previous.description) changedFields.push("description")
        if (current.priority !== previous.priority) changedFields.push("priority")
        if (current.status !== previous.status) changedFields.push("status")
        if (current.assignee !== previous.assignee) changedFields.push("assignee")
        if (current.reporter !== previous.reporter) changedFields.push("reporter")

        return changedFields
    }

    static createTicketSnapshot(ticket: any): TicketSnapshot {
        return {
            key: ticket.key,
            summary: ticket.summary,
            description: ticket.description,
            priority: ticket.priority,
            status: ticket.status,
            assignee: ticket.assignee,
            reporter: ticket.reporter,
            created: ticket.created,
        }
    }

    static updateTicketHistory(ticketKey: string, snapshot: TicketSnapshot, fieldResults: FieldValidationResult[]): void {
        const history = this.getHistory()
        const existingIndex = history.findIndex((entry) => entry.ticketKey === ticketKey)

        const overallScore = Math.round(fieldResults.reduce((sum, field) => sum + field.score, 0) / fieldResults.length)
        const isValid = fieldResults.every((field) => field.isValid) && overallScore >= 7

        const newEntry: ValidationHistoryEntry = {
            ticketKey,
            snapshot,
            fieldResults,
            overallScore,
            isValid,
            timestamp: new Date().toISOString(),
        }

        if (existingIndex >= 0) {
            history[existingIndex] = newEntry
        } else {
            history.push(newEntry)
        }

        this.saveHistory(history)
    }

    static mergeValidationResults(
        previousResults: FieldValidationResult[],
        newResults: FieldValidationResult[],
        changedFields: string[],
    ): FieldValidationResult[] {
        const merged: FieldValidationResult[] = []

        // Get all unique field names
        const allFields = new Set([...previousResults.map((r) => r.field), ...newResults.map((r) => r.field)])

        allFields.forEach((fieldName) => {
            if (changedFields.includes(fieldName)) {
                // Use new result for changed fields
                const newResult = newResults.find((r) => r.field === fieldName)
                if (newResult) {
                    merged.push(newResult)
                }
            } else {
                // Use previous result for unchanged fields
                const previousResult = previousResults.find((r) => r.field === fieldName)
                if (previousResult) {
                    merged.push(previousResult)
                }
            }
        })

        return merged
    }

    static clearHistory(): void {
        if (typeof window === "undefined") return
        localStorage.removeItem(this.STORAGE_KEY)
    }
}
