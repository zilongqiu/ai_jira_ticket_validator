"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { ValidationHistoryManager } from "@/lib/validation-history"
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Settings,
  HelpCircle,
  ExternalLink,
  RefreshCw,
  FileText,
  Ticket,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
  Zap,
} from "lucide-react"

interface JiraTicket {
  key: string
  summary: string
  description: string
  priority: string
  status: string
  assignee?: string
  reporter: string
  created: string
  labels?: string[]
  components?: string[]
}

interface ValidationResult {
  ticket: JiraTicket
  score: number
  issues: string[]
  suggestions: string[]
  fieldResults?: any[]
  validationType?: string
  changedFields?: string[]
  cachedFields?: string[]
}

// Simple skeleton component for tickets
const TicketSkeleton = () => (
  <Card className="shadow-sm border border-gray-200 rounded-lg animate-pulse">
    <CardHeader>
      <div className="flex justify-between items-start">
        <div>
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-48"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 bg-gray-200 rounded w-16"></div>
          <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
          <div className="h-5 w-5 bg-gray-200 rounded-sm"></div>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
      <div className="h-3 bg-gray-200 rounded w-5/6"></div>
      <div className="flex flex-wrap gap-2 mt-3">
        <div className="h-6 bg-gray-200 rounded w-20"></div>
        <div className="h-6 bg-gray-200 rounded w-24"></div>
        <div className="h-6 bg-gray-200 rounded w-28"></div>
      </div>
    </CardContent>
  </Card>
)

export default function JiraTicketValidator() {
  const [jiraUrl, setJiraUrl] = useState("")
  const [jiraUsername, setJiraUsername] = useState("")
  const [jiraPassword, setJiraPassword] = useState("")
  const [jiraProject, setJiraProject] = useState("")
  const [jqlQuery, setJqlQuery] = useState("")
  const [maxResults, setMaxResults] = useState("10")
  const [validationRules, setValidationRules] = useState(
    `
**Title/Summary Requirements:**
- Must be 10-80 characters long
- Should start with action verb (Add, Fix, Update, Remove, etc.) or user story format
- Must not contain vague words like "issue", "problem", "bug" without specifics
- Should include the component/feature being affected

**Description Requirements:**
- Must be at least 50 characters long
- Must include "Acceptance Criteria" section with at least 2 specific criteria
- For bugs: Must include "Steps to Reproduce", "Expected Result", "Actual Result"
- For features: Must include "User Story" and "Business Value"
- Should not contain placeholder text like "TBD", "TODO", "Fill this later"

**Priority Assessment:**
- Critical: System down, data loss, security breach
- High: Major feature broken, affects many users
- Medium: Minor feature issues, affects some users  
- Low: Cosmetic issues, nice-to-have improvements

**Status Validation:**
- "To Do" tickets must have assignee or be in backlog
- "In Progress" tickets must have assignee and recent activity
- "Done" tickets must have resolution and completion date

**Assignment Rules:**
- High/Critical priority tickets must have assignee
- Tickets in "In Progress" status must have assignee
- Unassigned tickets should be in "To Do" or "Backlog" status
`.trim(),
  )
  const [productRequirements, setProductRequirements] = useState(
    `
- As a user, I want to be able to log in securely using my email and password.
- The system should support two-factor authentication for enhanced security.
- The dashboard should display a summary of my recent activity and key metrics.
- Users must be able to update their profile information, including name and contact details.
- The application must be responsive and work well on desktop, tablet, and mobile devices.
`.trim(),
  )

  const [tickets, setTickets] = useState<JiraTicket[]>([])
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("config")
  const [error, setError] = useState<string>("")
  const [fetchInfo, setFetchInfo] = useState<{ total: number; fetched: number } | null>(null)
  const [selectedTicketKeys, setSelectedTicketKeys] = useState<Set<string>>(new Set())

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const ticketsPerPage = Number.parseInt(maxResults) || 10

  // Filtering states
  const [filterSummary, setFilterSummary] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterPriority, setFilterPriority] = useState("")
  const [filterAssignee, setFilterAssignee] = useState("")

  // New state for individual ticket re-validation loading
  const [revalidatingTicketKey, setRevalidatingTicketKey] = useState<string | null>(null)

  // Effect to select all tickets by default when new tickets are fetched
  useEffect(() => {
    if (tickets.length > 0) {
      const allKeys = new Set(tickets.map((ticket) => ticket.key))
      setSelectedTicketKeys(allKeys)
    } else {
      setSelectedTicketKeys(new Set()) // Clear if no tickets
    }
  }, [tickets])

  // JQL query examples for the placeholder
  const getJqlPlaceholder = () => {
    if (jiraProject) {
      return `project=${jiraProject} AND status != Done ORDER BY created DESC`
    }
    return "project=PROJ AND status != Done ORDER BY created DESC"
  }

  const fetchTickets = useCallback(
    async (page = 1) => {
      setIsLoading(true)
      setError("")
      setFetchInfo(null)
      setValidationResults([]) // Clear validation results on new fetch
      setCurrentPage(page) // Set current page for pagination

      const startAt = (page - 1) * ticketsPerPage

      try {
        const response = await fetch("/api/jira/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jiraUrl, jiraUsername, jiraPassword, jiraProject, jqlQuery, maxResults, startAt }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch tickets")
        }

        setTickets(data.tickets || data)
        setFetchInfo(data.total !== undefined ? { total: data.total, fetched: data.fetched } : null)
        setActiveTab("tickets")
        console.log(`Successfully loaded ${data.tickets?.length || data.length} tickets`)
      } catch (error) {
        console.error("Error fetching tickets:", error)
        setError(error instanceof Error ? error.message : "An unexpected error occurred")
      } finally {
        setIsLoading(false)
      }
    },
    [jiraUrl, jiraUsername, jiraPassword, jiraProject, jqlQuery, maxResults, ticketsPerPage],
  )

  const refreshTickets = useCallback(async () => {
    // Check if configuration is complete
    if (!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject) {
      setError("Please complete the configuration before refreshing tickets")
      return
    }
    await fetchTickets(currentPage) // Refresh current page
  }, [jiraUrl, jiraUsername, jiraPassword, jiraProject, fetchTickets, currentPage])

  const validateTickets = async () => {
    const ticketsToValidate = tickets.filter((ticket) => selectedTicketKeys.has(ticket.key))

    if (ticketsToValidate.length === 0) {
      setError("Please select at least one ticket to validate.")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const validationResults = await Promise.all(
        ticketsToValidate.map(async (ticket) => {
          const currentSnapshot = ValidationHistoryManager.createTicketSnapshot(ticket)
          const previousHistory = ValidationHistoryManager.getTicketHistory(ticket.key)

          if (previousHistory) {
            // Check for changes
            const changedFields = ValidationHistoryManager.detectChangedFields(
              currentSnapshot,
              previousHistory.snapshot,
            )

            if (changedFields.length === 0) {
              const overallScore = Math.floor(
                  previousHistory.fieldResults.reduce((sum, field) => sum + field.score, 0) / previousHistory.fieldResults.length,
              )

              // No changes - return cached results
              return {
                ticket,
                score: overallScore,
                issues: previousHistory.fieldResults.flatMap((f) => f.issues),
                suggestions: previousHistory.fieldResults.flatMap((f) => f.suggestions),
                fieldResults: previousHistory.fieldResults,
                validationType: "cached",
                changedFields: [],
                cachedFields: previousHistory.fieldResults.map((f) => f.field),
              }
            } else {
              // Validate only changed fields
              const response = await fetch("/api/validate-tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tickets: [ticket],
                  validationRules,
                  productRequirements,
                  fieldsToValidate: changedFields,
                }),
              })

              if (!response.ok) throw new Error("Failed to validate changed fields")

              const [newResult] = await response.json()

              // Merge with previous results
              const mergedFieldResults = ValidationHistoryManager.mergeValidationResults(
                previousHistory.fieldResults,
                newResult.fieldResults || [],
                changedFields,
              )

              // Update history
              ValidationHistoryManager.updateTicketHistory(ticket.key, currentSnapshot, mergedFieldResults)

              const overallScore = Math.floor(
                mergedFieldResults.reduce((sum, field) => sum + field.score, 0) / mergedFieldResults.length,
              )

              return {
                ticket,
                score: overallScore,
                issues: mergedFieldResults.flatMap((f) => f.issues),
                suggestions: mergedFieldResults.flatMap((f) => f.suggestions),
                fieldResults: mergedFieldResults,
                validationType: "partial",
                changedFields,
                cachedFields: previousHistory.fieldResults
                  .filter((f) => !changedFields.includes(f.field))
                  .map((f) => f.field),
              }
            }
          } else {
            // First time validation - validate all fields
            const response = await fetch("/api/validate-tickets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tickets: [ticket], validationRules, productRequirements }),
            })

            if (!response.ok) throw new Error("Failed to validate tickets")

            const [result] = await response.json()

            // Store in history
            if (result.fieldResults) {
              ValidationHistoryManager.updateTicketHistory(ticket.key, currentSnapshot, result.fieldResults)
            }

            const overallScore = Math.floor(
                result.fieldResults.reduce((sum, field) => sum + field.score, 0) / result.fieldResults.length,
            )

            return {
              ...result,
              score: overallScore,
              validationType: "full",
              changedFields: ["summary", "description", "priority", "status", "assignee"],
              cachedFields: [],
            }
          }
        }),
      )

      setValidationResults(validationResults)
      setActiveTab("results")
    } catch (error) {
      console.error("Error validating tickets:", error)
      setError(error instanceof Error ? error.message : "An unexpected error occurred during validation")
    } finally {
      setIsLoading(false)
    }
  }

  const refreshAndRevalidateSingleTicket = useCallback(
    async (ticketKey: string) => {
      if (!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject) {
        setError("Please complete the Jira configuration first.")
        return
      }

      setRevalidatingTicketKey(ticketKey)
      setError("")

      try {
        // 1. Fetch the latest ticket data from Jira
        const jiraResponse = await fetch("/api/jira/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jiraUrl,
            jiraUsername,
            jiraPassword,
            jiraProject,
            jqlQuery: `key = "${ticketKey}"`, // Fetch only this specific ticket
            maxResults: "1",
          }),
        })

        const jiraData = await jiraResponse.json()

        if (!jiraResponse.ok || !jiraData.tickets || jiraData.tickets.length === 0) {
          throw new Error(jiraData.error || `Failed to fetch ticket ${ticketKey} from Jira.`)
        }

        const latestTicket = jiraData.tickets[0]
        const currentSnapshot = ValidationHistoryManager.createTicketSnapshot(latestTicket)
        const previousHistory = ValidationHistoryManager.getTicketHistory(ticketKey)

        let newResult

        if (previousHistory) {
          const changedFields = ValidationHistoryManager.detectChangedFields(currentSnapshot, previousHistory.snapshot)

          if (changedFields.length === 0) {
            // No changes detected - preserve existing results exactly as they are
            const existingResult = validationResults.find((r) => r.ticket.key === ticketKey)

            if (existingResult) {
              // Update only the ticket data (in case of minor formatting changes that don't affect validation)
              // but keep all validation results identical
              newResult = {
                ...existingResult,
                ticket: latestTicket, // Update ticket data
                validationType: "cached",
                changedFields: [],
                cachedFields: previousHistory.fieldResults.map((f) => f.field),
              }
            } else {
              const overallScore = Math.floor(
                  previousHistory.fieldResults.reduce((sum, field) => sum + field.score, 0) / previousHistory.fieldResults.length,
              )

              // Fallback: reconstruct from history if not in current results
              newResult = {
                ticket: latestTicket,
                score: overallScore,
                issues: previousHistory.fieldResults.flatMap((f) => f.issues),
                suggestions: previousHistory.fieldResults.flatMap((f) => f.suggestions),
                fieldResults: previousHistory.fieldResults,
                validationType: "cached",
                changedFields: [],
                cachedFields: previousHistory.fieldResults.map((f) => f.field),
              }
            }

            // Don't update history since nothing changed
          } else {
            // Validate changed fields only
            const validateResponse = await fetch("/api/validate-tickets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                tickets: [latestTicket],
                validationRules,
                productRequirements,
                fieldsToValidate: changedFields,
              }),
            })

            const validationData = await validateResponse.json()
            if (!validateResponse.ok) throw new Error("Failed to re-validate ticket")

            const [partialResult] = validationData

            // Merge results
            const mergedFieldResults = ValidationHistoryManager.mergeValidationResults(
              previousHistory.fieldResults,
              partialResult.fieldResults || [],
              changedFields,
            )

            // Update history with new snapshot and merged results
            ValidationHistoryManager.updateTicketHistory(ticketKey, currentSnapshot, mergedFieldResults)

            const overallScore = Math.floor(
              mergedFieldResults.reduce((sum, field) => sum + field.score, 0) / mergedFieldResults.length,
            )

            newResult = {
              ticket: latestTicket,
              score: overallScore,
              issues: mergedFieldResults.flatMap((f) => f.issues),
              suggestions: mergedFieldResults.flatMap((f) => f.suggestions),
              fieldResults: mergedFieldResults,
              validationType: "partial",
              changedFields,
              cachedFields: previousHistory.fieldResults
                .filter((f) => !changedFields.includes(f.field))
                .map((f) => f.field),
            }
          }
        } else {
          // Full validation for new ticket
          const validateResponse = await fetch("/api/validate-tickets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tickets: [latestTicket],
              validationRules,
              productRequirements,
            }),
          })

          const validationData = await validateResponse.json()
          if (!validateResponse.ok) throw new Error("Failed to re-validate ticket")

          newResult = {
            ...validationData[0],
            validationType: "full",
            changedFields: ["summary", "description", "priority", "status", "assignee"],
            cachedFields: [],
          }

          // Store in history
          if (newResult.fieldResults) {
            ValidationHistoryManager.updateTicketHistory(ticketKey, currentSnapshot, newResult.fieldResults)
          }
        }

        // Update the validationResults state
        setValidationResults((prevResults) => {
          const existingIndex = prevResults.findIndex((r) => r.ticket.key === ticketKey)
          if (existingIndex !== -1) {
            const updatedResults = [...prevResults]
            updatedResults[existingIndex] = newResult
            return updatedResults
          } else {
            return [...prevResults, newResult]
          }
        })
      } catch (err) {
        console.error(`Error re-validating ticket ${ticketKey}:`, err)
        setError(err instanceof Error ? err.message : `An unexpected error occurred while re-validating ${ticketKey}.`)
      } finally {
        setRevalidatingTicketKey(null)
      }
    },
    [jiraUrl, jiraUsername, jiraPassword, jiraProject, validationRules, productRequirements, validationResults],
  )

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allKeys = new Set(filteredTickets.map((ticket) => ticket.key)) // Select all filtered tickets
      setSelectedTicketKeys(allKeys)
    } else {
      setSelectedTicketKeys(new Set())
    }
  }

  const handleSelectTicket = (key: string, checked: boolean) => {
    setSelectedTicketKeys((prev) => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(key)
      } else {
        newSet.delete(key)
      }
      return newSet
    })
  }

  const getStatusIcon = (score: number) => {
    if (score >= 8) return <CheckCircle className="h-5 w-5 text-green-500" />
    if (score >= 6) return <Clock className="h-5 w-5 text-yellow-500" />
    return <AlertCircle className="h-5 w-5 text-red-500" />
  }

  const getStatusColor = (score: number) => {
    if (score >= 8) return "bg-green-100 text-green-800"
    if (score >= 6) return "bg-yellow-100 text-yellow-800"
    return "bg-red-100 text-red-800"
  }

  const getValidationTypeIcon = (validationType: string) => {
    switch (validationType) {
      case "cached":
        return <History className="h-4 w-4 text-gray-500" />
      case "partial":
        return <Zap className="h-4 w-4 text-blue-500" />
      case "full":
        return <RefreshCw className="h-4 w-4 text-green-500" />
      default:
        return null
    }
  }

  const getValidationTypeLabel = (validationType: string) => {
    switch (validationType) {
      case "cached":
        return "Cached (No Changes)"
      case "partial":
        return "Partial Re-validation"
      case "full":
        return "Full Validation"
      default:
        return "Unknown"
    }
  }

  const openTicketInJira = (ticketKey: string) => {
    if (jiraUrl && ticketKey) {
      const cleanUrl = jiraUrl.replace(/\/$/, "")
      const ticketUrl = `${cleanUrl}/browse/${ticketKey}`
      window.open(ticketUrl, "_blank", "noopener,noreferrer")
    }
  }

  // Filtered tickets based on search and filter criteria
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesSummary = filterSummary
        ? ticket.summary.toLowerCase().includes(filterSummary.toLowerCase()) ||
          ticket.key.toLowerCase().includes(filterSummary.toLowerCase())
        : true
      const matchesStatus = filterStatus ? ticket.status.toLowerCase().includes(filterStatus.toLowerCase()) : true
      const matchesPriority = filterPriority
        ? ticket.priority.toLowerCase().includes(filterPriority.toLowerCase())
        : true
      const matchesAssignee = filterAssignee
        ? (ticket.assignee?.toLowerCase() || "").includes(filterAssignee.toLowerCase())
        : true
      return matchesSummary && matchesStatus && matchesPriority && matchesAssignee
    })
  }, [tickets, filterSummary, filterStatus, filterPriority, filterAssignee])

  // Pagination calculations
  const totalPages = fetchInfo ? Math.ceil(fetchInfo.total / ticketsPerPage) : 0
  const canGoPrev = currentPage > 1
  const canGoNext = currentPage < totalPages

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchTickets(newPage)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto p-6 max-w-6xl bg-white rounded-lg shadow-lg">
        <div className="mb-8 text-center relative">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-2">Jira Ticket Validator</h1>
          <p className="text-lg text-gray-600">AI-powered validation of Jira tickets based on your custom criteria</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex w-full border-b border-gray-200 bg-transparent rounded-none">
            <TabsTrigger
              value="config"
              className="flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
            >
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger
              value="rules"
              className="flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
            >
              <FileText className="h-4 w-4" />
              Validation Rules
            </TabsTrigger>
            <TabsTrigger
              value="requirements"
              className="flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
            >
              <ClipboardList className="h-4 w-4" />
              Product Requirements
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
            >
              <Ticket className="h-4 w-4" />
              Tickets ({fetchInfo?.fetched || 0})
              {fetchInfo && fetchInfo.total > fetchInfo.fetched && (
                <span className="text-xs text-muted-foreground">of {fetchInfo.total}</span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="results"
              className="flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-50 data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none"
            >
              <BarChart3 className="h-4 w-4" />
              Results ({validationResults.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-6">
            <Card className="shadow-sm border border-gray-200 rounded-lg bg-white">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-gray-800">Jira Configuration</CardTitle>
                <CardDescription className="text-gray-600">
                  Configure your Jira connection to fetch tickets for validation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="jira-url" className="text-gray-700">
                      Jira URL
                    </Label>
                    <Input
                      id="jira-url"
                      placeholder="https://yourcompany.atlassian.net"
                      value={jiraUrl}
                      onChange={(e) => setJiraUrl(e.target.value)}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jira-project" className="text-gray-700">
                      Project Key
                    </Label>
                    <Input
                      id="jira-project"
                      placeholder="PROJ"
                      value={jiraProject}
                      onChange={(e) => setJiraProject(e.target.value)}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="jira-username" className="text-gray-700">
                      Username
                    </Label>
                    <Input
                      id="jira-username"
                      placeholder="Your Jira username"
                      value={jiraUsername}
                      onChange={(e) => setJiraUsername(e.target.value)}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="jira-password" className="text-gray-700">
                      Password
                    </Label>
                    <Input
                      id="jira-password"
                      type="password"
                      placeholder="Your Jira password"
                      value={jiraPassword}
                      onChange={(e) => setJiraPassword(e.target.value)}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="jql-query" className="text-gray-700">
                        JQL Query (Optional)
                      </Label>
                      <div className="group relative">
                        <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                          Leave empty to use default query for the project
                        </div>
                      </div>
                    </div>
                    <Textarea
                      id="jql-query"
                      placeholder={getJqlPlaceholder()}
                      value={jqlQuery}
                      onChange={(e) => setJqlQuery(e.target.value)}
                      rows={3}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-results" className="text-gray-700">
                      Tickets Per Page
                    </Label>
                    <select
                      id="max-results"
                      value={maxResults}
                      onChange={(e) => setMaxResults(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 bg-background rounded-md text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50 text-gray-900"
                    >
                      <option value="10">10 tickets</option>
                      <option value="20">20 tickets</option>
                      <option value="50">50 tickets</option>
                      <option value="100">100 tickets</option>
                      <option value="all">All tickets (max 1000)</option>
                    </select>
                    <p className="text-xs text-gray-500">
                      {maxResults === "all"
                        ? "Fetches up to 1000 tickets (Jira's maximum per request)"
                        : `Fetches up to ${maxResults} tickets per page`}
                    </p>
                  </div>
                </div>

                <div className="text-xs text-gray-500 space-y-1 p-4 bg-gray-50 rounded-md border border-gray-200">
                  <p className="font-semibold text-gray-700">JQL Examples:</p>
                  <p>
                    • <code>project=PROJ AND status != Done ORDER BY created DESC</code>
                  </p>
                  <p>
                    • <code>project=PROJ AND priority=High AND assignee=currentUser()</code>
                  </p>
                  <p>
                    • <code>project=PROJ AND created {">"} -7d AND status IN (Open, "In Progress")</code>
                  </p>
                  <p>
                    • <code>project=PROJ AND labels=bug ORDER BY priority DESC</code>
                  </p>
                </div>

                <Button
                  onClick={() => fetchTickets()}
                  disabled={!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject || isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200"
                >
                  {isLoading ? "Fetching Tickets..." : "Fetch Tickets"}
                </Button>
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    <p>{error}</p>
                  </div>
                )}
                {fetchInfo && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-blue-800 text-sm">
                    <p>
                      Fetched {fetchInfo.fetched} of {fetchInfo.total} available tickets
                      {fetchInfo.total > fetchInfo.fetched && (
                        <span className="ml-1">({fetchInfo.total - fetchInfo.fetched} more available)</span>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <Card className="shadow-sm border border-gray-200 rounded-lg bg-white">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-gray-800">Validation Rules</CardTitle>
                <CardDescription className="text-gray-600">
                  Customize the criteria used to validate Jira tickets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="validation-rules" className="text-gray-700">
                    Validation Criteria
                  </Label>
                  <Textarea
                    id="validation-rules"
                    placeholder="Enter your validation rules..."
                    value={validationRules}
                    onChange={(e) => setValidationRules(e.target.value)}
                    rows={12}
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Define your validation criteria as bullet points. The AI will use these rules to evaluate each ticket.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requirements" className="space-y-4">
            <Card className="shadow-sm border border-gray-200 rounded-lg bg-white">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-gray-800">Product Requirements</CardTitle>
                <CardDescription className="text-gray-600">
                  Input the product requirements. The AI will check for mismatches between these requirements and the
                  ticket information.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="product-requirements" className="text-gray-700">
                    Feature Requirements
                  </Label>
                  <Textarea
                    id="product-requirements"
                    placeholder="Enter your product requirements here, e.g., 'As a user, I want to...', 'The system must support...'"
                    value={productRequirements}
                    onChange={(e) => setProductRequirements(e.target.value)}
                    rows={12}
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Provide detailed product requirements. The AI will use these to identify if ticket details align with
                  the expected features.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tickets" className="space-y-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Fetched Tickets</h2>
                {fetchInfo && (
                  <p className="text-sm text-gray-600">
                    Showing {fetchInfo.fetched} of {fetchInfo.total} total tickets
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={refreshTickets}
                    disabled={!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject || isLoading}
                    className="flex items-center gap-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors duration-200 bg-transparent"
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    {isLoading ? "Refreshing..." : "Refresh Tickets"}
                  </Button>
                  <Button
                    onClick={validateTickets}
                    disabled={selectedTicketKeys.size === 0 || isLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200"
                  >
                    {isLoading ? "Validating..." : `Validate Selected (${selectedTicketKeys.size})`}
                  </Button>
                </div>
                {tickets.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all-tickets"
                      checked={selectedTicketKeys.size === filteredTickets.length && filteredTickets.length > 0}
                      onCheckedChange={handleSelectAll}
                      disabled={filteredTickets.length === 0}
                      className="w-5 h-5 border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
                    />
                    <Label htmlFor="select-all-tickets" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Select All ({selectedTicketKeys.size})
                    </Label>
                  </div>
                )}
              </div>
            </div>

            {/* Filtering Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="space-y-2">
                <Label htmlFor="filter-summary" className="text-gray-700">
                  Summary/Key
                </Label>
                <Input
                  id="filter-summary"
                  placeholder="Filter by summary or key"
                  value={filterSummary}
                  onChange={(e) => setFilterSummary(e.target.value)}
                  className="border-gray-300 bg-white text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-status" className="text-gray-700">
                  Status
                </Label>
                <Input
                  id="filter-status"
                  placeholder="Filter by status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="border-gray-300 bg-white text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-priority" className="text-gray-700">
                  Priority
                </Label>
                <Input
                  id="filter-priority"
                  placeholder="Filter by priority"
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="border-gray-300 bg-white text-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="filter-assignee" className="text-gray-700">
                  Assignee
                </Label>
                <Input
                  id="filter-assignee"
                  placeholder="Filter by assignee"
                  value={filterAssignee}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  className="border-gray-300 bg-white text-gray-900"
                />
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                <p>{error}</p>
              </div>
            )}

            <div className="grid gap-4">
              {isLoading && tickets.length === 0 ? (
                Array.from({ length: ticketsPerPage }).map((_, i) => <TicketSkeleton key={i} />)
              ) : filteredTickets.length === 0 && !isLoading ? (
                <p className="text-center text-gray-500 py-8">No tickets found matching your criteria.</p>
              ) : (
                filteredTickets.map((ticket) => (
                  <Card key={ticket.key} className="shadow-sm border border-gray-200 rounded-lg bg-white">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg font-semibold text-gray-800">{ticket.key}</CardTitle>
                          <CardDescription className="text-gray-600">{ticket.summary}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-gray-300 text-gray-700">
                            {ticket.priority}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openTicketInJira(ticket.key)}
                            className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            title="Open in Jira"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Checkbox
                            id={`ticket-${ticket.key}`}
                            checked={selectedTicketKeys.has(ticket.key)}
                            onCheckedChange={(checked: boolean) => handleSelectTicket(ticket.key, checked)}
                            className="w-5 h-5 border-gray-300 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 line-clamp-3">{ticket.description}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Badge variant="secondary" className="bg-gray-100 text-gray-700 border border-gray-200">
                          {ticket.status}
                        </Badge>
                        <Badge variant="outline" className="border-gray-300 text-gray-700">
                          Reporter: {ticket.reporter}
                        </Badge>
                        {ticket.assignee && (
                          <Badge variant="outline" className="border-gray-300 text-gray-700">
                            Assignee: {ticket.assignee}
                          </Badge>
                        )}
                        {ticket.labels && ticket.labels.length > 0 && (
                          <>
                            {ticket.labels.map((label) => (
                              <Badge
                                key={label}
                                variant="outline"
                                className="bg-blue-50 text-blue-700 border border-blue-200"
                              >
                                {label}
                              </Badge>
                            ))}
                          </>
                        )}
                        {ticket.components && ticket.components.length > 0 && (
                          <>
                            {ticket.components.map((component) => (
                              <Badge
                                key={component}
                                variant="outline"
                                className="bg-green-50 text-green-700 border border-green-200"
                              >
                                {component}
                              </Badge>
                            ))}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!canGoPrev || isLoading}
                  className="flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!canGoNext || isLoading}
                  className="flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results" className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-800">Validation Results</h2>
              <Button
                variant="outline"
                onClick={() => ValidationHistoryManager.clearHistory()}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                Clear History
              </Button>
            </div>

            <div className="grid gap-4">
              {isLoading && validationResults.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => <TicketSkeleton key={i} />)
              ) : validationResults.length === 0 && !isLoading ? (
                <p className="text-center text-gray-500 py-8">No validation results yet. Fetch and validate tickets.</p>
              ) : (
                validationResults.map((result) => (
                  <Card key={result.ticket.key} className="shadow-sm border border-gray-200 rounded-lg bg-white">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(result.score)}
                          <div>
                            <CardTitle className="text-lg font-semibold text-gray-800">{result.ticket.key}</CardTitle>
                            <CardDescription className="text-gray-600">{result.ticket.summary}</CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(result.score)}>
                            Score: {result.score}/10
                          </Badge>
                          {result.validationType && (
                            <div
                              className="flex items-center gap-1"
                              title={getValidationTypeLabel(result.validationType)}
                            >
                              {getValidationTypeIcon(result.validationType)}
                              <span className="text-xs text-gray-500">
                                {result.validationType === "cached"
                                  ? "Cached"
                                  : result.validationType === "partial"
                                    ? "Partial"
                                    : "Full"}
                              </span>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openTicketInJira(result.ticket.key)}
                            className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            title="Open in Jira"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refreshAndRevalidateSingleTicket(result.ticket.key)}
                            disabled={revalidatingTicketKey === result.ticket.key || isLoading}
                            className="flex items-center gap-1 border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors duration-200"
                            title="Refresh & Re-validate"
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${revalidatingTicketKey === result.ticket.key ? "animate-spin" : ""}`}
                            />
                          </Button>
                        </div>
                      </div>

                      {/* Show validation type details */}
                      {(result.changedFields?.length > 0 || result.cachedFields?.length > 0) && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-md">
                          <div className="flex flex-wrap gap-2 text-xs">
                            {result.changedFields?.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Zap className="h-3 w-3 text-blue-500" />
                                <span className="text-blue-600">Re-validated:</span>
                                <span className="text-blue-800">{result.changedFields.join(", ")}</span>
                              </div>
                            )}
                            {result.cachedFields?.length > 0 && (
                              <div className="flex items-center gap-1">
                                <History className="h-3 w-3 text-gray-500" />
                                <span className="text-gray-600">Cached:</span>
                                <span className="text-gray-800">{result.cachedFields.join(", ")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {result.issues.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-red-600 mb-2">Issues Found:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {result.issues.map((issue, index) => (
                              <li key={index} className="text-sm text-red-600">
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {result.suggestions.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-blue-600 mb-2">Suggestions:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {result.suggestions.map((suggestion, index) => (
                              <li key={index} className="text-sm text-blue-600">
                                {suggestion}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
