import { UpdateSettings } from "./UpdateSettings";
import { GeneralSettings } from "./GeneralSettings";
import { AppearanceMode } from "../components/AppearanceMode";
import { useWorkspace } from "../workspace-context";
import { settingItems } from "../components/SettingsSidebar";
import { ChatGPTSettings } from "./ChatGPTSettings";
export function Settings() {
  const { workspace, update, settingsSection: section } = useWorkspace();
  return (
    <div className="settings-content">
      <h1>{settingItems.find((item) => item.id === section)?.label}</h1>
      {section === "general" && (
        <>
          <GeneralSettings />
          <UpdateSettings />
        </>
      )}
      {section === "chatgpt" && <ChatGPTSettings />}
      {section === "appearance" && (
        <section className="setting-group">
          <h2>Visual style</h2>
          <div className="setting-card">
            <div className="setting-row">
              <strong>Mode</strong>
              <div className="setting-control">
                <AppearanceMode
                  value={workspace.theme}
                  onChange={(theme) => update((w) => ({ ...w, theme }))}
                />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
