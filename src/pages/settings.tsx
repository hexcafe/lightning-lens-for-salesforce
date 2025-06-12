import React from "react";
import {
  Switch,
  Card,
  CardHeader,
  CardBody,
  Tooltip,
  Divider,
  Tabs,
  Tab,
  Button,
  addToast,
  Slider,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { client } from "./service";

export default function SettingsPage() {
  const [isLwcDebugEnabled, setIsLwcDebugEnabled] =
    React.useState<boolean>(false);
  const [isCaptureAuraEnabled, setIsCaptureAuraEnabled] = React.useState<
    boolean | null
  >(null);
  const [activeTab, setActiveTab] = React.useState<string>("debugging");
  const [maxRequestEntries, setMaxRequestEntries] = React.useState<number>(100);

  React.useEffect(() => {
    // Fetch both LWC debug status and Aura capture state on component mount
    const fetchInitialSettings = async () => {
      try {
        // Fetch LWC debug status
        const lwcStatus = await client.getLwcDebugStatus();
        setIsLwcDebugEnabled(lwcStatus);

        // Fetch Aura capture state
        const auraStatus = await client.getAuraCaptureState();
        setIsCaptureAuraEnabled(auraStatus);

        // Fetch max request entries
        const maxEntries = await client.getMaxRequestEntries();
        setMaxRequestEntries(maxEntries);
      } catch (error) {
        console.error("Failed to fetch settings:", error);
        addToast({
          title: "Error",
          description: "Failed to fetch settings",
          color: "danger",
          icon: <Icon icon="lucide:alert-triangle" />,
        });
      }
    };

    fetchInitialSettings();
  }, []);

  const handleToggleLwcDebug = React.useCallback(async (checked: boolean) => {
    setIsLwcDebugEnabled(checked);

    try {
      await client.toggleLwcDebug(checked);
      addToast({
        title: "Success",
        description: "LWC Debug Mode updated successfully!",
        color: "success",
        icon: <Icon icon="lucide:check-circle" />,
      });
    } catch (error) {
      console.error("Failed to toggle LWC debug mode:", error);
      // Revert UI state if the operation failed
      setIsLwcDebugEnabled(!checked);
      addToast({
        title: "Error",
        description: "Failed to update LWC Debug Mode",
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
    }
  }, []);

  // Update handleToggleAuraCapture to use the client method
  const handleToggleAuraCapture = React.useCallback(
    async (checked: boolean) => {
      if (isCaptureAuraEnabled === null || checked === isCaptureAuraEnabled) {
        setIsCaptureAuraEnabled(checked);
        return;
      }
      setIsCaptureAuraEnabled(checked);

      try {
        await client.setAuraCaptureState(checked);

        addToast({
          title: "Success",
          description: `Aura API capture ${checked ? "enabled" : "disabled"}`,
          color: "success",
          icon: <Icon icon="lucide:check-circle" />,
        });
      } catch (error) {
        console.error("Failed to toggle Aura API capture:", error);
        // Revert UI state if the operation failed
        setIsCaptureAuraEnabled(!checked);
        addToast({
          title: "Error",
          description: "Failed to update Aura API capture setting",
          color: "danger",
          icon: <Icon icon="lucide:alert-triangle" />,
        });
      }
    },
    [],
  );

  // Update handleClearData to use clearAllApiCalls
  const handleClearData = React.useCallback(async () => {
    try {
      await client.clearAllApiCalls();
      addToast({
        title: "Success",
        description: "All request data has been cleared",
        color: "success",
        icon: <Icon icon="lucide:check-circle" />,
      });
    } catch (error) {
      console.error("Failed to clear data:", error);
      addToast({
        title: "Error",
        description: "Failed to clear request data",
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
    }
  }, []);

  const handleMaxEntriesChange = React.useCallback(async (value: number) => {
    setMaxRequestEntries(value);

    try {
      await client.setMaxRequestEntries(value);
      addToast({
        title: "Success",
        description: `Max request entries set to ${value}`,
        color: "success",
        icon: <Icon icon="lucide:check-circle" />,
      });
    } catch (error) {
      console.error("Failed to update max entries:", error);
      addToast({
        title: "Error",
        description: "Failed to update max request entries",
        color: "danger",
        icon: <Icon icon="lucide:alert-triangle" />,
      });
    }
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0">
          <Card className="sticky top-4">
            <CardBody className="p-0">
              <Tabs
                aria-label="Settings categories"
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as string)}
                classNames={{
                  tabList: "flex-col w-full",
                  cursor: "w-1 h-full",
                  tab: "justify-start h-12 px-4",
                  tabContent:
                    "group-data-[selected=true]:text-primary font-medium",
                }}
                variant="bordered"
              >
                <Tab
                  key="debugging"
                  title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:bug" width={18} height={18} />
                      <span>Debugging</span>
                    </div>
                  }
                />
                <Tab
                  key="data"
                  title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:database" width={18} height={18} />
                      <span>Data</span>
                    </div>
                  }
                />
                <Tab
                  key="about"
                  title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:info" width={18} height={18} />
                      <span>About</span>
                    </div>
                  }
                />
              </Tabs>
            </CardBody>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {/* Debugging Settings */}
          {activeTab === "debugging" && (
            <Card>
              <CardHeader className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold">Debugging Tools</h1>
                <p className="text-default-500 text-sm">
                  Configure debugging features for your Salesforce org
                </p>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-content1 border-l-4 border-primary">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="lwc-debug-mode"
                        className="font-medium text-foreground"
                      >
                        LWC Debug Mode
                      </label>
                      <Tooltip
                        content={
                          isLwcDebugEnabled
                            ? "Currently Enabled"
                            : "Currently Disabled"
                        }
                      >
                        <div
                          className={`px-2 py-0.5 text-xs rounded-full ${isLwcDebugEnabled ? "bg-success-100 text-success-700" : "bg-danger-100 text-danger-700"}`}
                        >
                          {isLwcDebugEnabled ? "Enabled" : "Disabled"}
                        </div>
                      </Tooltip>
                    </div>
                    <p className="text-sm text-default-500 mt-1">
                      Enables more detailed error messages for Lightning Web
                      Components
                    </p>
                  </div>
                  <Switch
                    id="lwc-debug-mode"
                    isSelected={isLwcDebugEnabled}
                    onValueChange={handleToggleLwcDebug}
                    aria-label="Toggle LWC Debug Mode"
                    color="primary"
                    size="md"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-content1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor="aura-api-capture"
                        className="font-medium text-foreground"
                      >
                        Capture Aura API Requests
                      </label>
                      <Tooltip
                        content={
                          isCaptureAuraEnabled
                            ? "Currently Enabled"
                            : "Currently Disabled"
                        }
                      >
                        <div
                          className={`px-2 py-0.5 text-xs rounded-full ${isCaptureAuraEnabled ? "bg-success-100 text-success-700" : "bg-danger-100 text-danger-700"}`}
                        >
                          {isCaptureAuraEnabled ? "Enabled" : "Disabled"}
                        </div>
                      </Tooltip>
                    </div>
                    <p className="text-sm text-default-500 mt-1">
                      Monitor and capture Aura framework API calls
                    </p>
                  </div>
                  <Switch
                    id="aura-api-capture"
                    isSelected={isCaptureAuraEnabled || false}
                    onValueChange={handleToggleAuraCapture}
                    aria-label="Toggle Aura API Capture"
                    color="primary"
                    size="md"
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* Data Management Settings */}
          {activeTab === "data" && (
            <Card>
              <CardHeader className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold">Data Management</h1>
                <p className="text-default-500 text-sm">
                  Manage stored request data and settings
                </p>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-content1">
                  <div className="flex-1">
                    <label
                      htmlFor="max-entries"
                      className="font-medium text-foreground"
                    >
                      Maximum Request Entries
                    </label>
                    <p className="text-sm text-default-500 mt-1">
                      Limit the number of API requests stored in history
                    </p>
                    <div className="mt-4 px-2">
                      <Slider
                        id="max-entries"
                        aria-label="Maximum Request Entries"
                        step={50}
                        maxValue={500}
                        minValue={50}
                        value={maxRequestEntries}
                        onChange={(val) => handleMaxEntriesChange(Number(val))}
                        className="max-w-md"
                        showSteps={true}
                        marks={[
                          { value: 50, label: "50" },
                          { value: 100, label: "100" },
                          { value: 200, label: "200" },
                          { value: 300, label: "300" },
                          { value: 400, label: "400" },
                          { value: 500, label: "500" },
                        ]}
                      />
                      <div className="mt-2 text-small text-default-500">
                        Current value: {maxRequestEntries} entries
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-content1 border-l-4 border-danger">
                  <div className="flex-1">
                    <label className="font-medium text-foreground">
                      Clear Request Data
                    </label>
                    <p className="text-sm text-default-500 mt-1">
                      Delete all stored API request history from IndexedDB
                    </p>
                  </div>
                  <Button
                    color="danger"
                    variant="flat"
                    onPress={handleClearData}
                    startContent={
                      <Icon icon="lucide:trash-2" width={18} height={18} />
                    }
                  >
                    Clear Data
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {/* About Section */}
          {activeTab === "about" && (
            <Card>
              <CardHeader className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold">About</h1>
                <p className="text-default-500 text-sm">
                  Information about this extension
                </p>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-6">
                <div className="flex flex-col items-center p-6 text-center">
                  <div className="rounded-full bg-foreground text-background p-3 mb-4">
                    <Icon icon="lucide:zap" width={32} height={32} />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    Lightning Lens for Salesforce
                  </h2>
                  <p className="text-default-500 mb-4">Version 1.0.0</p>
                  <p className="text-sm text-default-600 max-w-md mx-auto mb-6">
                    A powerful browser extension for Salesforce developers and
                    admins that enhances your productivity with advanced
                    debugging and record management tools.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="flat"
                      color="primary"
                      startContent={<Icon icon="lucide:file-text" />}
                    >
                      Documentation (Coming soon)
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
