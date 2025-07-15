"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, CheckCircle, Clock, Settings } from "lucide-react"

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
  const [validationRules, setValidationRules] = useState(
      `
- Title must be clear and descriptive
- Description must include acceptance criteria
- Priority must be set appropriately
- Must have proper labels or components
- Should include steps to reproduce for bugs
- Must have clear business value for features
  `.trim(),
  )

  const [tickets, setTickets] = useState<JiraTicket[]>([])
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("config")
  const [error, setError] = useState<string>("")

  const fetchTickets = async () => {
    setIsLoading(true)
    setError("")

    try {
      const response = await fetch("/api/jira/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraUrl, jiraUsername, jiraPassword, jiraProject }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch tickets")
      }

      setTickets(data)
      setActiveTab("tickets")
      console.log(`Successfully loaded ${data.length} tickets`)
    } catch (error) {
      console.error("Error fetching tickets:", error)
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

  return (
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Jira Ticket Validator</h1>
          <p className="text-muted-foreground">AI-powered validation of Jira tickets based on your custom criteria</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger>
            <TabsTrigger value="results">Results ({validationResults.length})</TabsTrigger>
            <TabsTrigger value="rules">Validation Rules</TabsTrigger>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tickets" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Fetched Tickets</h2>
              <Button onClick={validateTickets} disabled={tickets.length === 0 || isLoading}>
                {isLoading ? "Validating..." : "Validate All Tickets"}
              </Button>
            </div>

            <div className="grid gap-4">
              {tickets.map((ticket) => (
                  <Card key={ticket.key}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{ticket.key}</CardTitle>
                          <CardDescription>{ticket.summary}</CardDescription>
                        </div>
                        <Badge variant="outline">{ticket.priority}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3">{ticket.description}</p>
                      <div className="flex gap-2 mt-3">
                        <Badge variant="secondary">{ticket.status}</Badge>
                        <Badge variant="outline">Reporter: {ticket.reporter}</Badge>
                        {ticket.assignee && <Badge variant="outline">Assignee: {ticket.assignee}</Badge>}
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
                        <div className="text-right">
                          <Badge className={getStatusColor(result.isValid, result.score)}>Score: {result.score}/10</Badge>
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
        </Tabs>
      </div>
  )
}
