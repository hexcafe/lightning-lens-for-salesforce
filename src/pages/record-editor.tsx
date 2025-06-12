import React from "react";
import {
  Button,
  Input,
  Textarea,
  Switch,
  Select,
  SelectItem,
  Card,
  CardBody,
  Spinner,
  Chip,
  Tooltip,
  Tabs,
  Tab,
  DatePicker,
  Popover,
  PopoverTrigger,
  PopoverContent,
  addToast,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { parseDate, parseDateTime } from "@internationalized/date";
import { client } from "./service";

// Helper function to render the correct input type based on field metadata
const renderField = (
  key: string,
  value: any,
  fieldMeta: any,
  handleChange: (name: string, value: any) => void,
) => {
  const isDisabled = !fieldMeta || !fieldMeta.updateable;

  switch (fieldMeta.type) {
    case "picklist":
      return (
        <Select
          label={fieldMeta.label}
          name={key}
          selectedKeys={value === null ? [] : [String(value)]}
          onSelectionChange={(keys) => {
            const selectedValue = Array.from(keys)[0] || null;
            handleChange(key, selectedValue);
          }}
          isDisabled={isDisabled}
          className="w-full"
          variant="bordered"
          size="sm"
          aria-label={fieldMeta.label}
          placeholder={fieldMeta.nillable ? "-- None --" : "Select a value"}
          selectionMode="single"
          disallowEmptySelection={!fieldMeta.nillable}
          classNames={{
            trigger: "min-h-unit-10",
          }}
        >
          {fieldMeta.picklistValues.map((option: any) => (
            <SelectItem key={option.value}>{option.label}</SelectItem>
          ))}
        </Select>
      );

    case "multipicklist":
      const selectedValues = value ? value.split(";") : [];
      return (
        <Select
          label={fieldMeta.label}
          name={key}
          selectionMode="multiple"
          selectedKeys={new Set(selectedValues)}
          onSelectionChange={(keys) => {
            const values = Array.from(keys);
            handleChange(key, values.join(";"));
          }}
          isDisabled={isDisabled}
          className="w-full"
          variant="bordered"
          size="sm"
          aria-label={fieldMeta.label}
        >
          {fieldMeta.picklistValues.map((option: any) => (
            <SelectItem key={option.value}>{option.label}</SelectItem>
          ))}
        </Select>
      );

    case "textarea":
      return (
        <Textarea
          label={fieldMeta.label}
          name={key}
          value={value === null ? "" : String(value)}
          onValueChange={(val) => handleChange(key, val)}
          isDisabled={isDisabled}
          className="min-h-[80px]"
          variant="bordered"
          size="sm"
        />
      );

    case "boolean":
      return (
        <div className="flex items-center h-full pt-4">
          <Switch
            id={key}
            name={key}
            isSelected={!!value}
            onValueChange={(checked) => handleChange(key, checked)}
            isDisabled={isDisabled}
            size="sm"
          >
            {value ? "Yes" : "No"}
          </Switch>
        </div>
      );

    case "date":
      let dateValue = null;
      try {
        if (value) {
          // Try to parse the date string into a CalendarDate
          dateValue = parseDate(String(value).split("T")[0]);
        }
      } catch (e) {
        console.error("Error parsing date:", e);
      }

      return (
        <DatePicker
          label={fieldMeta.label}
          value={dateValue}
          onChange={(date) => {
            // Convert CalendarDate to ISO string for storage
            const dateString = date ? date.toString() : null;
            handleChange(key, dateString);
          }}
          isDisabled={isDisabled}
          className="w-full"
          variant="bordered"
          size="sm"
        />
      );

    case "datetime":
      let dateTimeValue = null;
      try {
        if (value) {
          // Try to parse the datetime string into a CalendarDateTime
          const dateStr = new Date(value).toISOString();
          const datePart = dateStr.split("T")[0];
          const timePart = dateStr.split("T")[1].substring(0, 5); // HH:MM
          dateTimeValue = parseDateTime(`${datePart}T${timePart}`);
        }
      } catch (e) {
        console.error("Error parsing datetime:", e);
      }

      return (
        <DatePicker
          label={fieldMeta.label}
          value={dateTimeValue}
          onChange={(date) => {
            // Convert CalendarDateTime to ISO string for storage
            const dateString = date ? date.toString() : null;
            handleChange(key, dateString);
          }}
          isDisabled={isDisabled}
          className="w-full"
          variant="bordered"
          size="sm"
          granularity="minute"
        />
      );

    case "reference":
      return (
        <Input
          type="text"
          label={fieldMeta.label}
          name={key}
          value={value === null ? "" : String(value)}
          isDisabled={true}
          placeholder="Reference Field (read-only)"
          variant="bordered"
          size="sm"
          startContent={
            <Icon icon="lucide:link" className="text-default-400 text-sm" />
          }
        />
      );

    default:
      return (
        <Input
          type={
            fieldMeta.type === "currency" ||
            fieldMeta.type === "double" ||
            fieldMeta.type === "int"
              ? "number"
              : "text"
          }
          label={fieldMeta.label}
          name={key}
          value={value === null ? "" : String(value)}
          onChange={(e) => handleChange(key, e.target.value)}
          isDisabled={isDisabled}
          variant="bordered"
          size="sm"
          startContent={
            fieldMeta.type === "currency" ? (
              <div className="pointer-events-none flex items-center">
                <span className="text-default-400 text-sm">$</span>
              </div>
            ) : null
          }
        />
      );
  }
};

// Add a new component to display field schema details
const FieldSchemaInfo = ({ fieldMeta }: { fieldMeta: any }) => {
  if (!fieldMeta) return null;

  const schemaDetails = [
    { label: "API Name", value: fieldMeta.name },
    { label: "Type", value: fieldMeta.type },
    { label: "Label", value: fieldMeta.label },
    { label: "Required", value: fieldMeta.nillable ? "No" : "Yes" },
    { label: "Editable", value: fieldMeta.updateable ? "Yes" : "No" },
    { label: "Length", value: fieldMeta.length || "N/A" },
    {
      label: "Precision",
      value: fieldMeta.precision !== undefined ? fieldMeta.precision : "N/A",
    },
    {
      label: "Scale",
      value: fieldMeta.scale !== undefined ? fieldMeta.scale : "N/A",
    },
  ];

  return (
    <div className="p-2 max-w-xs">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Icon icon="lucide:info" className="text-primary" />
        Field Schema
      </h3>
      <div className="space-y-1">
        {schemaDetails.map((detail) => (
          <div key={detail.label} className="grid grid-cols-2 text-xs">
            <span className="text-default-500">{detail.label}:</span>
            <span className="font-medium break-words">{detail.value}</span>
          </div>
        ))}
        {fieldMeta.picklistValues && fieldMeta.picklistValues.length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-default-500">Picklist Values:</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {fieldMeta.picklistValues.map((option: any) => (
                <Chip
                  key={option.value}
                  size="sm"
                  variant="flat"
                  color="default"
                  className="text-xs"
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function RecordEditor() {
  const [record, setRecord] = React.useState<any>(null);
  const [editableRecord, setEditableRecord] = React.useState<any>(null);
  const [sObjectName, setSObjectName] = React.useState<string>("");
  const [schema, setSchema] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<string>("all");
  const [isDirty, setIsDirty] = React.useState<boolean>(false);
  const [showEditableOnly, setShowEditableOnly] =
    React.useState<boolean>(false);

  const handleGetRecord = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const recordData = await client.getRecord();
      setRecord(recordData);
      setEditableRecord({ ...recordData });
      const objectName = recordData.attributes.type;
      setSObjectName(objectName);

      try {
        const schemaData = await client.describeSObject(objectName);
        setSchema(schemaData);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to fetch object metadata";
        setError(errorMessage);
        addToast({
          title: "Error",
          description: errorMessage,
          color: "danger",
          icon: <Icon icon="lucide:alert-triangle" />,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to fetch record";
      setError(errorMessage);
      addToast({
        title: "Error",
        description: errorMessage,
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
      setRecord(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    handleGetRecord();
  }, [handleGetRecord]);

  const handleInputChange = (name: string, value: any) => {
    setEditableRecord((prev: any) => {
      const newRecord = { ...prev, [name]: value };
      // Check if any field has changed
      const hasChanges = Object.keys(newRecord).some(
        (key) => record && record[key] !== newRecord[key],
      );
      setIsDirty(hasChanges);
      return newRecord;
    });
  };

  const handleSave = React.useCallback(async () => {
    if (editableRecord) {
      setError(null);
      setIsLoading(true);

      const changes: { [key: string]: any } = { Id: editableRecord.Id };
      Object.keys(editableRecord).forEach((key) => {
        if (record[key] !== editableRecord[key]) {
          changes[key] =
            editableRecord[key] === "" ? null : editableRecord[key];
        }
      });

      try {
        await client.updateRecord(sObjectName, changes);
        addToast({
          title: "Success",
          description: "Record updated successfully!",
          color: "success",
          icon: <Icon icon="lucide:check-circle" />,
        });
        setIsDirty(false);
        handleGetRecord();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to update record";
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
    }
  }, [sObjectName, editableRecord, record, handleGetRecord]);

  const handleRefresh = () => {
    if (isDirty) {
      if (window.confirm("You have unsaved changes. Refresh anyway?")) {
        handleGetRecord();
        setIsDirty(false);
      }
    } else {
      handleGetRecord();
    }
  };

  const handleReset = () => {
    if (record) {
      setEditableRecord({ ...record });
      setIsDirty(false);
      // Show toast for reset action
      addToast({
        title: "Changes Reset",
        description: "All changes have been discarded.",
        color: "default",
        icon: <Icon icon="lucide:rotate-ccw" />,
      });
    }
  };

  if (isLoading && !record) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Spinner size="lg" color="primary" />
        <p className="mt-4 text-default-500">Loading record data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-4 mb-4 border border-danger rounded-medium bg-danger-50 dark:bg-danger-900/20 text-danger dark:text-danger-300">
          <div className="flex items-start gap-3">
            <Icon icon="lucide:alert-triangle" className="text-lg mt-0.5" />
            <div className="flex flex-col">
              <span className="font-medium">Error</span>
              <span className="text-sm">{error}</span>
            </div>
          </div>
        </div>
        <Button
          color="primary"
          variant="flat"
          onPress={handleGetRecord}
          startContent={<Icon icon="lucide:refresh-cw" />}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <Icon
          icon="lucide:file-question"
          className="text-6xl text-default-300 mb-4"
        />
        <h2 className="text-xl font-semibold mb-2">No Record Found</h2>
        <p className="text-default-500 text-center mb-6">
          Are you on a Salesforce record page? Navigate to a record and try
          again.
        </p>
        <Button
          color="primary"
          onPress={handleGetRecord}
          startContent={<Icon icon="lucide:refresh-cw" />}
        >
          Refresh
        </Button>
      </div>
    );
  }

  const fieldsMap = schema
    ? new Map(schema.fields.map((field: any) => [field.name, field]))
    : new Map();

  // Group fields by category for tabs
  const standardFields: [string, any][] = [];
  const systemFields: [string, any][] = [];
  const customFields: [string, any][] = [];

  Object.entries(editableRecord)
    .filter(([key]) => key !== "attributes")
    .forEach(([key, value]) => {
      const fieldMeta = fieldsMap.get(key);
      if (!fieldMeta) return;

      if (key.endsWith("__c")) {
        customFields.push([key, value]);
      } else if (
        key.startsWith("System") ||
        key === "Id" ||
        key.includes("LastModified") ||
        key.includes("Created")
      ) {
        systemFields.push([key, value]);
      } else {
        standardFields.push([key, value]);
      }
    });

  // Filter fields based on search term, active tab, and editable filter
  const getFilteredFields = () => {
    let fieldsToFilter: [string, any][] = [];

    switch (activeTab) {
      case "standard":
        fieldsToFilter = standardFields;
        break;
      case "custom":
        fieldsToFilter = customFields;
        break;
      case "system":
        fieldsToFilter = systemFields;
        break;
      default:
        fieldsToFilter = [...standardFields, ...customFields, ...systemFields];
    }

    return fieldsToFilter.filter(([key]) => {
      const fieldMeta = fieldsMap.get(key);
      if (!fieldMeta) return false;

      // Apply editable filter if enabled
      if (showEditableOnly && !fieldMeta.updateable) {
        return false;
      }

      const searchTermLower = searchTerm.toLowerCase();
      return (
        fieldMeta.label.toLowerCase().includes(searchTermLower) ||
        fieldMeta.name.toLowerCase().includes(searchTermLower)
      );
    });
  };

  const filteredFields = getFilteredFields();

  return (
    <div className="flex flex-col h-full">
      {/* Header Section */}
      <Card className="rounded-none shadow-none border-b border-t-0 border-x-0 bg-content1 dark:bg-content1 dark:border-default-100">
        <CardBody className="py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:database" className="text-primary text-xl" />
              <div>
                <h1 className="text-lg font-semibold flex items-center gap-2">
                  {sObjectName}
                  <Chip size="sm" variant="flat" color="primary">
                    {record.Id}
                  </Chip>
                </h1>
                <p className="text-sm text-default-500">
                  {schema?.label || "Record Editor"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Tooltip content="Refresh Record">
                <Button
                  isIconOnly
                  variant="light"
                  onPress={handleRefresh}
                  isLoading={isLoading}
                >
                  <Icon icon="lucide:refresh-cw" className="text-default-500" />
                </Button>
              </Tooltip>
              {isDirty && (
                <Tooltip content="Reset Changes">
                  <Button
                    isIconOnly
                    variant="light"
                    color="danger"
                    onPress={handleReset}
                  >
                    <Icon icon="lucide:rotate-ccw" />
                  </Button>
                </Tooltip>
              )}
              <Button
                color="primary"
                onPress={handleSave}
                isDisabled={!isDirty || isLoading}
                startContent={<Icon icon="lucide:save" />}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Tabs and Search */}
      <div className="px-4 border-b dark:border-default-100">
        <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(key as string)}
            variant="underlined"
            size="sm"
            classNames={{
              tabList: "gap-6 w-full relative rounded-none p-0 border-divider",
              cursor: "w-full bg-primary",
              tab: "max-w-fit px-0 h-12",
              tabContent: "group-data-[selected=true]:text-primary",
            }}
          >
            <Tab
              key="all"
              title={
                <div className="flex items-center gap-1">
                  <Icon icon="lucide:layers" width={16} height={16} />
                  <span>All Fields</span>
                  <Chip size="sm" variant="flat" className="ml-1">
                    {standardFields.length +
                      customFields.length +
                      systemFields.length}
                  </Chip>
                </div>
              }
            />
            <Tab
              key="standard"
              title={
                <div className="flex items-center gap-1">
                  <Icon icon="lucide:list" width={16} height={16} />
                  <span>Standard</span>
                  <Chip size="sm" variant="flat" className="ml-1">
                    {standardFields.length}
                  </Chip>
                </div>
              }
            />
            <Tab
              key="custom"
              title={
                <div className="flex items-center gap-1">
                  <Icon icon="lucide:puzzle" width={16} height={16} />
                  <span>Custom</span>
                  <Chip size="sm" variant="flat" className="ml-1">
                    {customFields.length}
                  </Chip>
                </div>
              }
            />
            <Tab
              key="system"
              title={
                <div className="flex items-center gap-1">
                  <Icon icon="lucide:cog" width={16} height={16} />
                  <span>System</span>
                  <Chip size="sm" variant="flat" className="ml-1">
                    {systemFields.length}
                  </Chip>
                </div>
              }
            />
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Switch
                size="sm"
                isSelected={showEditableOnly}
                onValueChange={setShowEditableOnly}
                color="primary"
              >
                <span className="text-xs whitespace-nowrap">Editable only</span>
              </Switch>
            </div>
            <Input
              type="text"
              placeholder="Search fields..."
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
              className="w-full sm:w-64 mb-2 sm:mb-0"
              isClearable
            />
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <main className="flex-grow p-4 overflow-y-auto mb-16">
        {isLoading && record && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
            <Spinner size="lg" color="primary" />
          </div>
        )}

        {!schema ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" color="primary" />
            <span className="ml-2">Loading schema...</span>
          </div>
        ) : filteredFields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Icon
              icon="lucide:file-search"
              className="text-4xl text-default-300 mb-2"
            />
            <p className="text-default-500">No fields match your criteria</p>
            <div className="flex gap-2 mt-2">
              {searchTerm && (
                <Button
                  variant="light"
                  size="sm"
                  onPress={() => setSearchTerm("")}
                >
                  Clear Search
                </Button>
              )}
              {showEditableOnly && (
                <Button
                  variant="light"
                  size="sm"
                  onPress={() => setShowEditableOnly(false)}
                >
                  Show All Fields
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            {filteredFields.map(([key, value]) => {
              const fieldMeta = fieldsMap.get(key);
              if (!fieldMeta) return null;

              const isChanged = record[key] !== editableRecord[key];

              return (
                <div
                  key={key}
                  className={`space-y-1 ${
                    isChanged
                      ? "bg-primary-50 dark:bg-primary-900/20 p-2 rounded-lg -m-2"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {isChanged && (
                        <Tooltip content="Value changed">
                          <Icon
                            icon="lucide:pencil"
                            className="text-primary text-xs"
                          />
                        </Tooltip>
                      )}
                      <Popover placement="top">
                        <PopoverTrigger>
                          <button className="flex items-center gap-1 hover:text-primary transition-colors">
                            <span className="font-mono text-xs text-default-400 hover:text-primary-500 truncate max-w-[150px]">
                              {fieldMeta.name}
                            </span>
                            <Icon
                              icon="lucide:info"
                              className="text-xs text-default-400 hover:text-primary-500 flex-shrink-0"
                            />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="dark:bg-content2 dark:border-default-100">
                          <FieldSchemaInfo fieldMeta={fieldMeta} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="flex items-center gap-1">
                      {!fieldMeta.updateable && (
                        <Tooltip content="Read-only field">
                          <Icon
                            icon="lucide:lock"
                            className="text-default-400 text-xs"
                          />
                        </Tooltip>
                      )}
                      {fieldMeta.nillable === false && (
                        <Tooltip content="Required field">
                          <Icon
                            icon="lucide:asterisk"
                            className="text-danger text-xs"
                          />
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  {renderField(key, value, fieldMeta, handleInputChange)}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Fixed Footer */}
      <Card className="fixed bottom-0 w-full rounded-none shadow-lg border-t border-x-0 border-b-0 z-10 dark:bg-content1 dark:border-default-100">
        <CardBody className="py-3 px-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-small text-default-500">
              {filteredFields.length} of{" "}
              {standardFields.length +
                customFields.length +
                systemFields.length}{" "}
              fields
              {showEditableOnly && (
                <Chip color="primary" variant="flat" size="sm" className="ml-2">
                  Editable only
                </Chip>
              )}
              {isDirty && (
                <Chip color="warning" variant="dot" size="sm" className="ml-2">
                  Unsaved changes
                </Chip>
              )}
            </div>
            <div className="flex gap-2">
              {isDirty && (
                <Button
                  variant="flat"
                  color="danger"
                  onPress={handleReset}
                  size="sm"
                >
                  Reset
                </Button>
              )}
              <Button
                color="primary"
                onPress={handleSave}
                isDisabled={!isDirty || isLoading}
                size="sm"
                startContent={<Icon icon="lucide:save" />}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
