"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  isValid: boolean
  score: number
  issues: string[]
  suggestions: string[]
}

export default function JiraTicketValidator() {
  const [jiraUrl, setJiraUrl] = useState("")
  const [jiraUsername, setJiraUsername] = useState("")
  const [jiraPassword, setJiraPassword] = useState("")
  const [jiraProject, setJiraProject] = useState("")
  const [jqlQuery, setJqlQuery] = useState("")
  const [maxResults, setMaxResults] = useState("10")
  const [validationRules, setValidationRules] = useState(
      `
- Title must be clear and descriptive
- Description must include acceptance criteria
- Priority must be set appropriately
- Should include steps to reproduce for bugs
- Must have clear business value for features
  `.trim(),
  )

  const [tickets, setTickets] = useState<JiraTicket[]>([])
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("config")
  const [error, setError] = useState<string>("")
  const [fetchInfo, setFetchInfo] = useState<{ total: number; fetched: number } | null>(null)

  // JQL query examples for the placeholder
  const getJqlPlaceholder = () => {
    if (jiraProject) {
      return `project=${jiraProject} AND status != Done ORDER BY created DESC`
    }
    return "project=PROJ AND status != Done ORDER BY created DESC"
  }

  const fetchTickets = async () => {
    setIsLoading(true)
    setError("")
    setFetchInfo(null)

    try {
      const response = await fetch("/api/jira/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraUrl, jiraUsername, jiraPassword, jiraProject, jqlQuery, maxResults }),
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
  }

  const refreshTickets = async () => {
    // Check if configuration is complete
    if (!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject) {
      setError("Please complete the configuration before refreshing tickets")
      return
    }

    setIsLoading(true)
    setError("")
    setFetchInfo(null)

    try {
      const response = await fetch("/api/jira/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraUrl, jiraUsername, jiraPassword, jiraProject, jqlQuery, maxResults }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to refresh tickets")
      }

      setTickets(data.tickets || data)
      setFetchInfo(data.total !== undefined ? { total: data.total, fetched: data.fetched } : null)
      // Clear validation results when refreshing tickets
      setValidationResults([])
      console.log(`Successfully refreshed ${data.tickets?.length || data.length} tickets`)
    } catch (error) {
      console.error("Error refreshing tickets:", error)
      setError(error instanceof Error ? error.message : "An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const validateTickets = async () => {
    if (tickets.length === 0) return

    setIsLoading(true)
    try {
      const response = await fetch("/api/validate-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickets, validationRules }),
      })

      if (!response.ok) throw new Error("Failed to validate tickets")

      const results = await response.json()
      setValidationResults(results)
      setActiveTab("results")
    } catch (error) {
      console.error("Error validating tickets:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (isValid: boolean, score: number) => {
    if (isValid && score >= 8) return <CheckCircle className="h-5 w-5 text-green-500" />
    if (score >= 6) return <Clock className="h-5 w-5 text-yellow-500" />
    return <AlertCircle className="h-5 w-5 text-red-500" />
  }

  const getStatusColor = (isValid: boolean, score: number) => {
    if (isValid && score >= 8) return "bg-green-100 text-green-800"
    if (score >= 6) return "bg-yellow-100 text-yellow-800"
    return "bg-red-100 text-red-800"
  }

  const openTicketInJira = (ticketKey: string) => {
    if (jiraUrl && ticketKey) {
      const cleanUrl = jiraUrl.replace(/\/$/, "")
      const ticketUrl = `${cleanUrl}/browse/${ticketKey}`
      window.open(ticketUrl, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Jira Ticket Validator</h1>
        <p className="text-muted-foreground">AI-powered validation of Jira tickets based on your custom criteria</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config" className="flex items-center gap-1">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            Validation Rules
          </TabsTrigger>
          <TabsTrigger value="tickets" className="flex items-center gap-1">
            <Ticket className="h-4 w-4" />
            Tickets ({tickets.length})
            {fetchInfo && fetchInfo.total > fetchInfo.fetched && (
              <span className="text-xs text-muted-foreground">of {fetchInfo.total}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            Results ({validationResults.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Jira Configuration</CardTitle>
              <CardDescription>Configure your Jira connection to fetch tickets for validation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jira-url">Jira URL</Label>
                  <Input
                    id="jira-url"
                    placeholder="https://yourcompany.atlassian.net"
                    value={jiraUrl}
                    onChange={(e) => setJiraUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jira-project">Project Key</Label>
                  <Input
                    id="jira-project"
                    placeholder="PROJ"
                    value={jiraProject}
                    onChange={(e) => setJiraProject(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="jira-username">Username</Label>
                  <Input
                    id="jira-username"
                    placeholder="Your Jira username"
                    value={jiraUsername}
                    onChange={(e) => setJiraUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jira-password">Password</Label>
                  <Input
                    id="jira-password"
                    type="password"
                    placeholder="Your Jira password"
                    value={jiraPassword}
                    onChange={(e) => setJiraPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="jql-query">JQL Query (Optional)</Label>
                    <div className="group relative">
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-black text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-results">Max Results</Label>
                  <select
                    id="max-results"
                    value={maxResults}
                    onChange={(e) => setMaxResults(e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="10">10 tickets</option>
                    <option value="20">20 tickets</option>
                    <option value="50">50 tickets</option>
                    <option value="100">100 tickets</option>
                    <option value="all">All tickets</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {maxResults === "all"
                      ? "Fetches up to 1000 tickets (Jira's maximum)"
                      : `Fetches up to ${maxResults} tickets`}
                  </p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  <strong>JQL Examples:</strong>
                </p>
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
                onClick={fetchTickets}
                disabled={!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject || isLoading}
                className="w-full"
              >
                {isLoading ? "Fetching Tickets..." : "Fetch Tickets"}
              </Button>
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}
              {fetchInfo && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-blue-800 text-sm">
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
          <Card>
            <CardHeader>
              <CardTitle>Validation Rules</CardTitle>
              <CardDescription>Customize the criteria used to validate Jira tickets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="validation-rules">Validation Criteria</Label>
                <Textarea
                  id="validation-rules"
                  placeholder="Enter your validation rules..."
                  value={validationRules}
                  onChange={(e) => setValidationRules(e.target.value)}
                  rows={12}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Define your validation criteria as bullet points. The AI will use these rules to evaluate each ticket.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-semibold">Fetched Tickets</h2>
              {fetchInfo && (
                <p className="text-sm text-muted-foreground">
                  Showing {fetchInfo.fetched} of {fetchInfo.total} total tickets
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={refreshTickets}
                disabled={!jiraUrl || !jiraUsername || !jiraPassword || !jiraProject || isLoading}
                className="flex items-center gap-2 bg-transparent"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Refreshing..." : "Refresh Tickets"}
              </Button>
              <Button onClick={validateTickets} disabled={tickets.length === 0 || isLoading}>
                {isLoading ? "Validating..." : "Validate All Tickets"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <div className="grid gap-4">
            {tickets.map((ticket) => (
              <Card key={ticket.key}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{ticket.key}</CardTitle>
                      <CardDescription>{ticket.summary}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{ticket.priority}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openTicketInJira(ticket.key)}
                        className="h-8 w-8 p-0"
                        title="Open in Jira"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">{ticket.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge variant="secondary">{ticket.status}</Badge>
                    <Badge variant="outline">Reporter: {ticket.reporter}</Badge>
                    {ticket.assignee && <Badge variant="outline">Assignee: {ticket.assignee}</Badge>}
                    {ticket.labels && ticket.labels.length > 0 && (
                      <>
                        {ticket.labels.map((label) => (
                          <Badge key={label} variant="outline" className="bg-blue-50 text-blue-700">
                            {label}
                          </Badge>
                        ))}
                      </>
                    )}
                    {ticket.components && ticket.components.length > 0 && (
                      <>
                        {ticket.components.map((component) => (
                          <Badge key={component} variant="outline" className="bg-green-50 text-green-700">
                            {component}
                          </Badge>
                        ))}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          <h2 className="text-2xl font-semibold">Validation Results</h2>

          <div className="grid gap-4">
            {validationResults.map((result) => (
              <Card key={result.ticket.key}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(result.isValid, result.score)}
                      <div>
                        <CardTitle className="text-lg">{result.ticket.key}</CardTitle>
                        <CardDescription>{result.ticket.summary}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(result.isValid, result.score)}>Score: {result.score}/10</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openTicketInJira(result.ticket.key)}
                        className="h-8 w-8 p-0"
                        title="Open in Jira"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
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
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
