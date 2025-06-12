import React from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Card,
  CardBody,
  Button,
  Chip,
  Spinner,
  Tooltip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Input,
  Pagination,
  Tabs,
  Tab,
  Popover,
  PopoverTrigger,
  PopoverContent,
  addToast,
  ScrollShadow,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { client } from "./service";
import hljs from "highlight.js/lib/core";
import json from "highlight.js/lib/languages/json";
import "highlight.js/styles/github.css"; // Base style for light mode

// Register JSON language with highlight.js
hljs.registerLanguage("json", json);

// Define types for API call data
interface ApiCall {
  id: string; // Now a UUID string, not auto-incrementing
  tabId: number; // The ID of the tab that originated the call
  requestedAt: number; // Timestamp when the request was made
  respondedAt: number; // Timestamp when the response was received
  duration: number; // The difference in milliseconds
  requestPayload: any;
  responsePayload: any;
  status: "Success" | "Error";
  type: "ApexAction" | "RecordUi" | "Other"; // The type of API call

  // Add these fields to maintain compatibility with existing component
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  timestamp: number; // We'll use requestedAt for this
  requestBody?: any; // We'll map from requestPayload
  responseBody?: any; // We'll map from responsePayload
  error?: string;

  // Add a new property for the description
  description?: string;
}

// Move the generateApiCallDescription function outside and before the component
// Add a function to generate descriptive names for API calls
const generateApiCallDescription = (call: ApiCall): string => {
  try {
    if (call.type === "ApexAction") {
      // For Apex calls, show namespace.classname.method
      const params =
        typeof call.requestPayload === "string"
          ? JSON.parse(call.requestPayload).params
          : call.requestPayload?.params;

      if (params) {
        return `${params.namespace || ""}.${params.classname || ""}.${params.method || ""}`;
      }
    } else if (call.type === "RecordUi") {
      // For RecordUI calls, show the action and recordId/object type
      const descriptor =
        typeof call.requestPayload === "string"
          ? JSON.parse(call.requestPayload).descriptor
          : call.requestPayload?.descriptor;

      const params =
        typeof call.requestPayload === "string"
          ? JSON.parse(call.requestPayload).params
          : call.requestPayload?.params;

      if (descriptor && params) {
        // Extract the action name from the descriptor (e.g., getRecordWithFields)
        const actionMatch = descriptor.match(/ACTION\$([^\/]+)/);
        const action = actionMatch ? actionMatch[1] : "";

        // Get recordId and determine object type if possible
        const recordId = params.recordId || "";
        let objectType = "";

        if (params.fields && params.fields.length > 0) {
          // Try to extract object type from fields like "Opportunity.Id"
          const fieldParts = params.fields[0].split(".");
          if (fieldParts.length > 1) {
            objectType = fieldParts[0];
          }
        }

        return `${action}${objectType ? ` (${objectType})` : ""} ${recordId}`;
      }
    }

    return call.type;
  } catch (err) {
    console.error("Error generating description:", err);
    return call.type;
  }
};

// Format JSON with proper indentation and filter content based on API call type
const formatJson = (data: any, isRequest: boolean) => {
  try {
    let jsonData = data;

    // Parse string data if needed
    if (typeof data === "string") {
      jsonData = JSON.parse(data);
    }

    // For all API calls, filter to show only relevant parts
    if (isRequest && jsonData.params) {
      // For request, only show params object
      return JSON.stringify(jsonData.params, null, 2);
    } else if (!isRequest && jsonData.returnValue) {
      // For response, only show returnValue
      // Handle different return value structures
      if (jsonData.returnValue.returnValue !== undefined) {
        return JSON.stringify(jsonData.returnValue.returnValue, null, 2);
      } else {
        return JSON.stringify(jsonData.returnValue, null, 2);
      }
    }

    // Default: return the full formatted JSON
    return JSON.stringify(jsonData, null, 2);
  } catch (e) {
    // If parsing fails, return as is
    return typeof data === "string" ? data : String(data);
  }
};

// Highlight JSON using highlight.js
const highlightJson = (jsonString: string) => {
  try {
    const highlighted = hljs.highlight(jsonString, {
      language: "json",
    }).value;
    return highlighted;
  } catch (e) {
    console.error("Error highlighting JSON:", e);
    return jsonString;
  }
};

// Component to display request/response details
const ApiCallDetails = ({ apiCall }: { apiCall: ApiCall }) => {
  // Add state for copy feedback
  const [copiedRequest, setCopiedRequest] = React.useState(false);
  const [copiedResponse, setCopiedResponse] = React.useState(false);

  // Copy functions with visual feedback - update to use the filtered JSON
  const copyRequestPayload = () => {
    try {
      const payload = formatJson(apiCall.requestPayload, true);

      navigator.clipboard.writeText(payload);
      setCopiedRequest(true);
      setTimeout(() => setCopiedRequest(false), 2000);
    } catch (err) {
      console.error("Failed to copy request payload:", err);
    }
  };

  const copyResponsePayload = () => {
    try {
      const payload = formatJson(apiCall.responsePayload, false);

      navigator.clipboard.writeText(payload);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    } catch (err) {
      console.error("Failed to copy response payload:", err);
    }
  };

  // Add keyboard shortcut handlers
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+R for request, Alt+S for response
      if (e.altKey && e.key === "r") {
        copyRequestPayload();
      } else if (e.altKey && e.key === "s") {
        copyResponsePayload();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [apiCall]);

  // Add custom CSS for dark mode support
  React.useEffect(() => {
    // Add custom styles for dark mode
    const style = document.createElement("style");
    style.textContent = `
      /* Dark mode styles for highlight.js */
      .dark .hljs {
        color: #abb2bf;
        background: transparent;
      }
      .dark .hljs-comment,
      .dark .hljs-quote {
        color: #5c6370;
        font-style: italic;
      }
      .dark .hljs-doctag,
      .dark .hljs-keyword,
      .dark .hljs-formula {
        color: #c678dd;
      }
      .dark .hljs-section,
      .dark .hljs-name,
      .dark .hljs-selector-tag,
      .dark .hljs-deletion,
      .dark .hljs-subst {
        color: #e06c75;
      }
      .dark .hljs-literal {
        color: #56b6c2;
      }
      .dark .hljs-string,
      .dark .hljs-regexp,
      .dark .hljs-addition,
      .dark .hljs-attribute,
      .dark .hljs-meta .hljs-string {
        color: #98c379;
      }
      .dark .hljs-attr,
      .dark .hljs-variable,
      .dark .hljs-template-variable,
      .dark .hljs-type,
      .dark .hljs-selector-class,
      .dark .hljs-selector-attr,
      .dark .hljs-selector-pseudo,
      .dark .hljs-number {
        color: #d19a66;
      }
      .dark .hljs-symbol,
      .dark .hljs-bullet,
      .dark .hljs-link,
      .dark .hljs-meta,
      .dark .hljs-selector-id,
      .dark .hljs-title {
        color: #61aeee;
      }
      .dark .hljs-built_in,
      .dark .hljs-title.class_,
      .dark .hljs-class .hljs-title {
        color: #e6c07b;
      }
      .dark .hljs-emphasis {
        font-style: italic;
      }
      .dark .hljs-strong {
        font-weight: bold;
      }
      .dark .hljs-link {
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className="w-full max-h-[70vh] overflow-auto p-4 space-y-6">
      {/* Request Payload */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon
              icon="lucide:arrow-up-right"
              width={16}
              height={16}
              className="text-primary"
            />
            Request Params
          </h3>
          <Tooltip content={copiedRequest ? "Copied!" : "Copy (Alt+R)"}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={copyRequestPayload}
              isDisabled={!apiCall.requestPayload}
              className={copiedRequest ? "text-success" : ""}
            >
              <Icon
                icon={copiedRequest ? "lucide:check" : "lucide:copy"}
                width={16}
                height={16}
              />
            </Button>
          </Tooltip>
        </div>
        <Card className="bg-content2">
          <CardBody className="p-2">
            {apiCall.requestPayload ? (
              <pre
                className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[200px] p-1 hljs"
                dangerouslySetInnerHTML={{
                  __html: highlightJson(
                    formatJson(apiCall.requestPayload, true),
                  ),
                }}
              />
            ) : (
              <div className="text-xs text-default-400">
                No request payload available
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Response Payload */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon
              icon="lucide:arrow-down-left"
              width={16}
              height={16}
              className="text-success"
            />
            Response Return Value
          </h3>
          <Tooltip content={copiedResponse ? "Copied!" : "Copy (Alt+S)"}>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onPress={copyResponsePayload}
              isDisabled={!apiCall.responsePayload}
              className={copiedResponse ? "text-success" : ""}
            >
              <Icon
                icon={copiedResponse ? "lucide:check" : "lucide:copy"}
                width={16}
                height={16}
              />
            </Button>
          </Tooltip>
        </div>
        <Card className="bg-content2">
          <CardBody className="p-2">
            {apiCall.responsePayload ? (
              <pre
                className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[200px] p-1 hljs"
                dangerouslySetInnerHTML={{
                  __html: highlightJson(
                    formatJson(apiCall.responsePayload, false),
                  ),
                }}
              />
            ) : (
              <div className="text-xs text-default-400">
                No response payload available
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Error (if any) */}
      {apiCall.error && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-danger flex items-center gap-2">
            <Icon icon="lucide:alert-triangle" width={16} height={16} />
            Error
          </h3>
          <Card className="bg-danger-50 dark:bg-danger-900/20">
            <CardBody className="p-2">
              <pre className="text-xs font-mono text-danger whitespace-pre-wrap break-all">
                {apiCall.error}
              </pre>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
};

export default function RequestsLog() {
  const [apiCalls, setApiCalls] = React.useState<ApiCall[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // Remove viewMode state and add filterType state
  const [filterType, setFilterType] = React.useState<
    "all" | "RecordUi" | "ApexAction"
  >("all");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [page, setPage] = React.useState(1);
  const rowsPerPage = 10;

  // Function to fetch API calls - only current tab
  const fetchApiCalls = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Only fetch current tab's API calls
      const calls = await client.listApiCalls();

      // Add descriptions to each call
      const enhancedCalls = calls.map((call) => ({
        ...call,
        description: generateApiCallDescription(call),
      }));

      setApiCalls(enhancedCalls);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch API calls";
      setError(errorMessage);
      addToast({
        title: "Error",
        description: errorMessage,
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Function to clear API calls - only current tab
  const handleClearCalls = React.useCallback(async () => {
    try {
      // Only clear current tab's API calls
      await client.clearApiCalls();

      setApiCalls([]);
      addToast({
        title: "Success",
        description: "API calls cleared",
        color: "success",
        icon: <Icon icon="lucide:check-circle" />,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to clear API calls";
      addToast({
        title: "Error",
        description: errorMessage,
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
    }
  }, []);

  // Load API calls on component mount
  React.useEffect(() => {
    fetchApiCalls();

    // Set up polling for new API calls every 5 seconds
    const intervalId = setInterval(fetchApiCalls, 5000);

    return () => clearInterval(intervalId);
  }, [fetchApiCalls]);

  // Filter API calls based on search term and filterType
  const filteredCalls = React.useMemo(() => {
    let filtered = apiCalls;

    // Filter by type if not "all"
    if (filterType !== "all") {
      filtered = filtered.filter((call) => call.type === filterType);
    }

    // Then filter by search term if present
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (call) =>
          call.type.toLowerCase().includes(lowerSearchTerm) ||
          String(call.status).includes(lowerSearchTerm) ||
          (call.description &&
            call.description.toLowerCase().includes(lowerSearchTerm)),
      );
    }

    return filtered;
  }, [apiCalls, searchTerm, filterType]);

  // Calculate pagination
  const pages = Math.ceil(filteredCalls.length / rowsPerPage);
  const paginatedCalls = filteredCalls.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  // Format timestamp to readable date
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Copy payload functions
  const handleCopyRequestPayload = (call: ApiCall) => {
    try {
      const payload = formatJson(call.requestPayload, true);

      navigator.clipboard
        .writeText(payload)
        .then(() => {
          addToast({
            title: "Copied",
            description: "Request payload copied to clipboard",
            color: "success",
            icon: <Icon icon="lucide:clipboard-check" width={16} height={16} />,
          });
        })
        .catch((err) => {
          throw err;
        });
    } catch (err) {
      addToast({
        title: "Error",
        description: "Failed to copy request payload",
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" width={16} height={16} />,
      });
    }
  };

  const handleCopyResponsePayload = (call: ApiCall) => {
    try {
      const payload = formatJson(call.responsePayload, false);

      navigator.clipboard
        .writeText(payload)
        .then(() => {
          addToast({
            title: "Copied",
            description: "Response payload copied to clipboard",
            color: "success",
            icon: <Icon icon="lucide:clipboard-check" width={16} height={16} />,
          });
        })
        .catch((err) => {
          throw err;
        });
    } catch (err) {
      addToast({
        title: "Error",
        description: "Failed to copy response payload",
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" width={16} height={16} />,
      });
    }
  };

  if (isLoading && apiCalls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Spinner size="lg" color="primary" />
        <p className="mt-4 text-default-500">Loading API calls...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Section */}
      <Card className="rounded-none shadow-none border-b border-t-0 border-x-0 bg-content1 dark:bg-content1 dark:border-default-100">
        <CardBody className="py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:activity" className="text-primary text-xl" />
              <div>
                <h1 className="text-lg font-semibold">API Requests Log</h1>
                <p className="text-sm text-default-500">
                  Monitor and inspect Salesforce API calls
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Tooltip content="Refresh">
                <Button
                  isIconOnly
                  variant="light"
                  onPress={fetchApiCalls}
                  isLoading={isLoading}
                >
                  <Icon icon="lucide:refresh-cw" className="text-default-500" />
                </Button>
              </Tooltip>
              <Button
                color="danger"
                variant="flat"
                onPress={handleClearCalls}
                startContent={<Icon icon="lucide:trash-2" />}
              >
                Clear Log
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Filters and Search */}
      <div className="px-4 py-3 border-b dark:border-default-100">
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
          {/* Replace viewMode buttons with filter type tabs */}
          <div className="flex gap-2">
            <Tabs
              aria-label="Filter API calls"
              selectedKey={filterType}
              onSelectionChange={(key) =>
                setFilterType(key as "all" | "RecordUi" | "ApexAction")
              }
              variant="light"
              size="sm"
              classNames={{
                tabList: "gap-2",
                tab: "px-3 py-1",
              }}
            >
              <Tab key="all" title="All" />
              <Tab key="RecordUi" title="RecordUI" />
              <Tab key="ApexAction" title="Apex" />
            </Tabs>
          </div>

          <Input
            type="text"
            placeholder="Search requests..."
            value={searchTerm}
            onValueChange={setSearchTerm}
            size="sm"
            startContent={
              <Icon
                icon="lucide:search"
                className="text-default-400"
                width={16}
                height={16}
              />
            }
            className="w-full sm:w-64"
            isClearable
          />
        </div>
      </div>

      {/* Main Content - Update ScrollShadow and Table configuration */}
      <ScrollShadow className="flex-grow overflow-auto" hideScrollBar={false}>
        <div className="p-4">
          {error ? (
            <div className="p-4 mb-4 border border-danger rounded-medium bg-danger-50 dark:bg-danger-900/20 text-danger dark:text-danger-300">
              <div className="flex items-start gap-3">
                <Icon icon="lucide:alert-triangle" className="text-lg mt-0.5" />
                <div className="flex flex-col">
                  <span className="font-medium">Error</span>
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Icon
                icon="lucide:activity"
                className="text-6xl text-default-300 mb-4"
              />
              <h2 className="text-xl font-semibold mb-2">No API Calls Found</h2>
              <p className="text-default-500 text-center mb-6 max-w-md">
                {searchTerm
                  ? "No API calls match your search criteria. Try a different search term."
                  : "No API calls have been captured yet. Navigate through Salesforce to capture API requests."}
              </p>
              {searchTerm && (
                <Button
                  variant="light"
                  onPress={() => setSearchTerm("")}
                  startContent={<Icon icon="lucide:x" />}
                >
                  Clear Search
                </Button>
              )}
            </div>
          ) : (
            <Card className="overflow-visible">
              <Table
                aria-label="API Calls Table"
                removeWrapper
                isHeaderSticky
                classNames={{
                  base: "overflow-auto max-h-[calc(100vh-280px)]",
                  th: "bg-default-100/50 dark:bg-default-50/20 text-default-600 sticky top-0 z-10",
                  table: "min-w-full",
                }}
              >
                <TableHeader>
                  <TableColumn key="type" width={100}>
                    TYPE
                  </TableColumn>
                  <TableColumn key="description">DESCRIPTION</TableColumn>
                  <TableColumn key="status" width={100}>
                    STATUS
                  </TableColumn>
                  <TableColumn key="timestamp" width={180}>
                    TIMESTAMP
                  </TableColumn>
                  <TableColumn key="duration" width={100}>
                    DURATION
                  </TableColumn>
                  <TableColumn
                    key="actions"
                    width={100}
                    className="sticky right-0 bg-default-100/50 dark:bg-default-50/20"
                  >
                    ACTIONS
                  </TableColumn>
                </TableHeader>
                <TableBody emptyContent="No API calls found">
                  {paginatedCalls.map((call) => (
                    <TableRow
                      key={call.id}
                      className="hover:bg-default-50 dark:hover:bg-default-50/10"
                    >
                      <TableCell>
                        <Chip
                          variant="flat"
                          color={
                            call.type === "ApexAction"
                              ? "primary"
                              : call.type === "RecordUi"
                                ? "success"
                                : "default"
                          }
                          size="sm"
                        >
                          {call.type}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <Tooltip content={call.description || call.type}>
                          <span className="text-xs font-mono truncate block max-w-[300px]">
                            {call.description || call.type}
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          variant="flat"
                          color={
                            call.status === "Success" ? "success" : "danger"
                          }
                          size="sm"
                        >
                          {call.status}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">
                          {formatTimestamp(call.requestedAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{call.duration}ms</span>
                      </TableCell>
                      <TableCell className="sticky right-0 bg-content1 dark:bg-content1">
                        <div className="flex items-center gap-2">
                          <Popover placement="left">
                            <PopoverTrigger>
                              <Button isIconOnly size="sm" variant="light">
                                <Icon
                                  icon="lucide:eye"
                                  width={16}
                                  height={16}
                                />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[600px]">
                              <ApiCallDetails apiCall={call} />
                            </PopoverContent>
                          </Popover>

                          <Dropdown>
                            <DropdownTrigger>
                              <Button isIconOnly size="sm" variant="light">
                                <Icon
                                  icon="lucide:more-vertical"
                                  width={16}
                                  height={16}
                                />
                              </Button>
                            </DropdownTrigger>
                            <DropdownMenu aria-label="API Call Actions">
                              <DropdownItem
                                key="copy-request"
                                startContent={
                                  <Icon
                                    icon="lucide:copy"
                                    width={16}
                                    height={16}
                                  />
                                }
                                onPress={() => handleCopyRequestPayload(call)}
                                isDisabled={!call.requestPayload}
                              >
                                Copy Request Payload
                              </DropdownItem>
                              <DropdownItem
                                key="copy-response"
                                startContent={
                                  <Icon
                                    icon="lucide:clipboard"
                                    width={16}
                                    height={16}
                                  />
                                }
                                onPress={() => handleCopyResponsePayload(call)}
                                isDisabled={!call.responsePayload}
                              >
                                Copy Response Payload
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      </ScrollShadow>

      {/* Pagination */}
      {filteredCalls.length > 0 && (
        <div className="flex justify-between items-center px-4 py-3 border-t dark:border-default-100">
          <span className="text-small text-default-500">
            Showing{" "}
            {Math.min(filteredCalls.length, (page - 1) * rowsPerPage + 1)} to{" "}
            {Math.min(filteredCalls.length, page * rowsPerPage)} of{" "}
            {filteredCalls.length} entries
          </span>
          <Pagination
            total={pages}
            page={page}
            onChange={setPage}
            showControls
            size="sm"
          />
        </div>
      )}
    </div>
  );
}
