import React from "react";
import {
  Card,
  CardBody,
  Button,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  Chip,
  TableRow,
  TableCell,
  Tooltip,
  ScrollShadow,
  Popover,
  PopoverTrigger,
  PopoverContent,
  addToast,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { client } from "../services/client";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import {
  autocompletion,
  CompletionContext,
  Completion,
} from "@codemirror/autocomplete";
import { format as sqlFormat } from "sql-formatter";

export default function SoqlQueryPage() {
  const [query, setQuery] = React.useState(
    "SELECT FIELDS(STANDARD) FROM Account LIMIT 10",
  );
  const [records, setRecords] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [fields, setFields] = React.useState<string[]>([]);
  const editorRef = React.useRef<EditorView | null>(null);

  const objectName = React.useMemo(() => {
    const m = /from\s+([a-zA-Z0-9_]+)/i.exec(query);
    return m?.[1] ?? null;
  }, [query]);

  React.useEffect(() => {
    if (!objectName) {
      setFields([]);
      return;
    }
    client
      .describeSObject(objectName)
      .then((desc) => {
        const f = (desc.fields || []).map((fld: any) => fld.name);
        setFields(f);
      })
      .catch(() => setFields([]));
  }, [objectName]);

  const runQuery = React.useCallback(async () => {
    let text = query;
    const cm = editorRef.current;
    if (cm) {
      const sel = cm.state.sliceDoc(
        cm.state.selection.main.from,
        cm.state.selection.main.to,
      );
      if (sel.trim()) {
        text = sel;
      }
    }

    if (!/limit\s+\d+/i.test(text)) {
      text = text.replace(/;?\s*$/, "") + " LIMIT 100";
      addToast({
        title: "Info",
        description: "No LIMIT found, applying LIMIT 100",
        color: "warning",
        icon: <Icon icon="lucide:info" />,
      });
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await client.runSoql(text);
      const recs = (result as any).records ?? result;
      setRecords(recs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      setError(message);
      addToast({
        title: "Error",
        description: message,
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const formatQuery = React.useCallback(() => {
    try {
      const formatted = sqlFormat(query, { language: "sql" });
      setQuery(formatted);
    } catch (err) {
      addToast({
        title: "Error",
        description: "Failed to format query",
        color: "warning",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
    }
  }, [query]);

  const copyResults = React.useCallback(() => {
    try {
      const text = JSON.stringify(records, null, 2);
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy results", err);
    }
  }, [records]);

  const completionExtension = React.useMemo(() => {
    if (fields.length === 0) return [];
    const options: Completion[] = fields.map((f) => ({
      label: f,
      type: "property",
    }));
    return autocompletion({
      override: [
        (context: CompletionContext) => {
          const word = context.matchBefore(/\w*/);
          if (!word || (word.from === word.to && !context.explicit))
            return null;
          return {
            from: word.from,
            options,
          };
        },
      ],
    });
  }, [fields]);

  const columns = React.useMemo(() => {
    if (records.length === 0) return [];

    // Filter out the 'attributes' column from the results
    return Object.keys(records[0]).filter((key) => key !== "attributes");
  }, [records]);

  // Format cell value for display
  const formatCellValue = React.useCallback((value: any, key: string) => {
    if (value === null || value === undefined) {
      return <span className="text-default-400 italic">null</span>;
    }

    if (typeof value === "object") {
      // Handle nested objects (like relationships)
      return (
        <Popover placement="bottom">
          <PopoverTrigger>
            <Button size="sm" variant="light" className="h-6 min-w-0 px-2 py-0">
              <span className="text-xs text-primary">{"{...}"}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="p-2 max-w-md max-h-[300px] overflow-auto">
              <pre className="text-xs whitespace-pre-wrap break-all">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          </PopoverContent>
        </Popover>
      );
    }

    // Handle ID fields with special formatting
    if (
      ((key === "Id" || key.endsWith("Id")) &&
        typeof value === "string" &&
        value.length === 15) ||
      value.length === 18
    ) {
      return (
        <div className="flex items-center gap-1">
          <span className="font-mono">{value}</span>
          <Tooltip content="Copy ID">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className="h-5 w-5 min-w-0 p-0"
              onPress={() => {
                navigator.clipboard.writeText(value);
                addToast({
                  title: "Copied",
                  description: "ID copied to clipboard",
                  color: "success",
                  icon: <Icon icon="lucide:check" />,
                });
              }}
            >
              <Icon icon="lucide:copy" className="h-3 w-3" />
            </Button>
          </Tooltip>
        </div>
      );
    }

    // Handle boolean values
    if (typeof value === "boolean") {
      return value ? (
        <Chip size="sm" color="success" variant="flat">
          True
        </Chip>
      ) : (
        <Chip size="sm" color="danger" variant="flat">
          False
        </Chip>
      );
    }

    // Handle date values
    if (
      typeof value === "string" &&
      (/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value))
    ) {
      try {
        const date = new Date(value);
        return (
          <span className="text-default-600">{date.toLocaleString()}</span>
        );
      } catch (e) {
        // If date parsing fails, fall back to string
        return String(value);
      }
    }

    return String(value);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Card className="rounded-none shadow-none border-b border-t-0 border-x-0 bg-content1 dark:bg-content1 dark:border-default-100">
        <CardBody className="py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:terminal" className="text-primary text-xl" />
              <div>
                <h1 className="text-lg font-semibold">SOQL Query</h1>
                <p className="text-sm text-default-500">
                  Execute SOQL against the current org
                </p>
              </div>
            </div>
            <Button
              color="primary"
              onPress={runQuery}
              startContent={<Icon icon="lucide:play" />}
              isLoading={isLoading}
            >
              Run Query
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="p-4 space-y-4 flex-grow overflow-auto">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={formatQuery}
              startContent={<Icon icon="lucide:code-2" />}
            >
              Format
            </Button>
            <Tooltip content={copied ? "Copied!" : "Copy JSON"}>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onPress={copyResults}
                isDisabled={records.length === 0}
                className={copied ? "text-success" : ""}
              >
                <Icon
                  icon={copied ? "lucide:check" : "lucide:copy"}
                  width={16}
                  height={16}
                />
              </Button>
            </Tooltip>
          </div>
          <CodeMirror
            value={query}
            onChange={(v) => setQuery(v)}
            onCreateEditor={(view) => (editorRef.current = view)}
            height="150px"
            theme={vscodeDark}
            extensions={[sql(), completionExtension]}
          />
        </div>
        {error && (
          <div className="p-3 border border-danger-200 bg-danger-50 dark:bg-danger-900/20 dark:border-danger-700 rounded-medium text-danger text-sm">
            <div className="flex items-start gap-2">
              <Icon icon="lucide:alert-triangle" className="mt-0.5" />
              <div>{error}</div>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8">
            <Spinner size="lg" color="primary" />
            <p className="mt-4 text-default-500">Executing query...</p>
          </div>
        ) : records.length > 0 ? (
          <Card className="overflow-hidden">
            <CardBody className="p-0">
              <div className="flex items-center justify-between px-3 py-2 bg-content2 border-b">
                <div className="text-sm">
                  <span className="font-medium">{records.length}</span>
                  <span className="text-default-500">
                    {" "}
                    row{records.length > 1 ? "s" : ""} returned
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip content={copied ? "Copied!" : "Copy as JSON"}>
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={copyResults}
                      startContent={
                        <Icon
                          icon={copied ? "lucide:check" : "lucide:copy"}
                          width={16}
                          height={16}
                        />
                      }
                    >
                      {copied ? "Copied" : "Copy Results"}
                    </Button>
                  </Tooltip>
                  <Tooltip content="Export as CSV">
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        try {
                          // Create CSV content
                          const headers = columns.join(",");
                          const rows = records.map((rec) =>
                            columns
                              .map((col) => {
                                const val = rec[col];
                                if (val === null || val === undefined)
                                  return "";
                                if (typeof val === "object")
                                  return JSON.stringify(val).replace(
                                    /"/g,
                                    '""',
                                  );
                                return String(val).replace(/"/g, '""');
                              })
                              .join(","),
                          );
                          const csv = [headers, ...rows].join("\n");

                          // Create download link
                          const blob = new Blob([csv], { type: "text/csv" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `soql_export_${new Date().toISOString().slice(0, 10)}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);

                          addToast({
                            title: "Exported",
                            description: "Data exported as CSV",
                            color: "success",
                            icon: <Icon icon="lucide:check" />,
                          });
                        } catch (err) {
                          console.error("Failed to export CSV", err);
                          addToast({
                            title: "Error",
                            description: "Failed to export CSV",
                            color: "danger",
                            icon: <Icon icon="lucide:alert-triangle" />,
                          });
                        }
                      }}
                      startContent={
                        <Icon icon="lucide:download" width={16} height={16} />
                      }
                    >
                      Export CSV
                    </Button>
                  </Tooltip>
                </div>
              </div>

              <ScrollShadow className="max-h-[calc(100vh-350px)]">
                <Table
                  removeWrapper
                  isHeaderSticky
                  aria-label="SOQL Query Results"
                  classNames={{
                    base: "overflow-auto",
                    table: "min-w-full",
                    th: "bg-default-50 dark:bg-default-100/20 text-default-600 text-xs sticky top-0 z-10",
                    td: "py-2",
                  }}
                >
                  <TableHeader>
                    {columns.map((c) => (
                      <TableColumn key={c} className="font-medium">
                        {c}
                      </TableColumn>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {records.map((rec, idx) => (
                      <TableRow
                        key={idx}
                        className="hover:bg-default-50 dark:hover:bg-default-100/10"
                      >
                        {columns.map((c) => (
                          <TableCell key={c} className="text-xs font-mono">
                            {formatCellValue(rec[c], c)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollShadow>
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed border-default-200 rounded-large">
            <Icon
              icon="lucide:database"
              className="w-12 h-12 text-default-300 mb-4"
            />
            <p className="text-default-500 text-center">
              No results to display
            </p>
            <p className="text-xs text-default-400 text-center mt-1">
              Run a query to see results here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
