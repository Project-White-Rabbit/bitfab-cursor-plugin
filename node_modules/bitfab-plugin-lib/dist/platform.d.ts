export interface PlatformConfig {
    /** Auth path segment, e.g. "claude" or "cursor" */
    authPath: string;
    /** Login command hint shown in error messages, e.g. "/bitfab:login" */
    loginHint: string;
    /** Setup command hint, e.g. "/bitfab:setup" */
    setupHint: string;
    /** Update command hint, e.g. "/bitfab:update" */
    updateHint: string;
    /** GitHub repo for update checks, e.g. "Project-White-Rabbit/bitfab-claude-plugin" */
    repo: string;
    /** CLI binary name, e.g. "claude" or "cursor" */
    cliBinary: string;
    /** Display name for restart messages, e.g. "Claude Code" or "Cursor" */
    displayName: string;
    /** Whether the plugin supports auto-update detection */
    supportsAutoUpdate: boolean;
}
