// Shared types for Daggerheart game system
// Used by both frontend and backend for type safety

export interface StatResource {
  current: number;
  max: number;
}

export interface Thresholds {
  major: number;
  severe: number;
}

export interface PlayerState {
  name: string;
  level: number;
  hp: StatResource;
  stress: StatResource;
  hope: number;
  armor: StatResource;
  evasion: number;
  thresholds: Thresholds;
  proficiency: number;
  conditions: string[];
  experiences: string[];
  class: string;
  background: any; // Allow complex background object
  currentLocation: string;
  gold: string | number;
  inventory: any[]; // Allow complex inventory items
  attributes?: any;
  domain_cards?: any[];
  equipment?: any;
  features?: any[];
}

export interface GMState {
  fear: number;
  hasSpotlight: boolean;
}

export interface SceneState {
  currentScene: string;
  sceneDescription: string;
  activeQuests: string[];
  countdowns: any[];
}

export interface GameState {
  player: PlayerState;
  gm: GMState;
  scene: SceneState;
  sessionId: string;
  languageCorrections: number;
  vocabularyIntroduced: string[];
}

export interface ConversationItem {
  timestamp: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  type: 'message' | 'audio' | 'tool_call';
  toolName?: string;
  toolArguments?: any;
  toolOutput?: any;
}

// Tool result types
export interface ToolResult {
  name: string;
  parameters: any;
  output: any;
  gameState: GameState;
}

// WebSocket message types
export interface WSMessage {
  type: 'connected' | 'game_state_updated' | 'tool_executed' | 'history_updated' | 'audio' | 'error' | 'disconnected';
  sessionId?: string;
  gameState?: GameState;
  toolResult?: ToolResult;
  history?: any[];
  audio?: string;
  error?: string;
} 