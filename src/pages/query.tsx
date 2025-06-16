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
  TableRow,
  TableCell,
  Tooltip,
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
    "SELECT Id FROM Account LIMIT 10",
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
    const options: Completion[] = fields.map((f) => ({ label: f, type: "property" }));
    return autocompletion({
      override: [
        (context: CompletionContext) => {
          const word = context.matchBefore(/\w*/);
          if (!word || (word.from === word.to && !context.explicit)) return null;
          return {
            from: word.from,
            options,
          };
        },
      ],
    });
  }, [fields]);

  const columns = React.useMemo(
    () => (records.length > 0 ? Object.keys(records[0]) : []),
    [records],
  );

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
          <div className="text-danger text-sm font-medium">{error}</div>
        )}
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        ) : records.length > 0 ? (
          <Card className="overflow-auto">
            <CardBody className="p-0">
              <div className="px-2 py-1 text-xs text-default-500 border-b bg-content2">
                {records.length} row{records.length > 1 ? "s" : ""}
              </div>
              <Table
                removeWrapper
                isHeaderSticky
                classNames={{ base: "overflow-auto", table: "min-w-full" }}
              >
                <TableHeader>
                  {columns.map((c) => (
                    <TableColumn key={c}>{c}</TableColumn>
                  ))}
                </TableHeader>
                <TableBody>
                  {records.map((rec, idx) => (
                    <TableRow key={idx}>
                      {columns.map((c) => (
                        <TableCell key={c} className="text-xs">
                          {String(rec[c])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        ) : (
          <div className="text-sm text-default-500">No results</div>
        )}
      </div>
    </div>
  );
}
