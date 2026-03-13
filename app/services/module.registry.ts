// Module registry service for dynamic module discovery

import { ModuleDefinition } from "@/components/layout/modules/_registry"

export interface ModuleConfig {
  id: string
  name: string
  description: string
  icon: string // component name or path
  color: string
  bg: string
  border: string
  isStandard?: boolean
  panelTitle?: string
}

export class ModuleRegistry {
  private static instance: ModuleRegistry
  private modules: Map<string, ModuleDefinition> = new Map()
  private configs: Map<string, ModuleConfig> = new Map()
  private initialized = false

  private constructor() {}

  static getInstance(): ModuleRegistry {
    if (!ModuleRegistry.instance) {
      ModuleRegistry.instance = new ModuleRegistry()
    }
    return ModuleRegistry.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // In a production environment, you could load modules dynamically
      // For now, we'll use the static imports but in a more flexible way
      await this.loadModules()
      this.initialized = true
    } catch (error) {
      console.error("[ModuleRegistry] Failed to initialize:", error)
      throw error
    }
  }

  private async loadModules(): Promise<void> {
    // This is a placeholder for dynamic module loading
    // In a real implementation, you could use:
    // 1. import.meta.glob for Vite
    // 2. require.context for Webpack
    // 3. Directory scanning for Node.js
    
    // For now, we'll define a configuration-based approach
    const moduleConfigs: ModuleConfig[] = [
      {
        id: "standard",
        name: "Standard Node",
        description: "Standard workflow node",
        icon: "Box",
        color: "text-blue-600",
        bg: "bg-blue-50",
        border: "border-blue-200",
        isStandard: true
      },
      {
        id: "text",
        name: "Text",
        description: "Generate or process text",
        icon: "Type",
        color: "text-green-600",
        bg: "bg-green-50",
        border: "border-green-200"
      },
      {
        id: "image",
        name: "Image",
        description: "Generate or process images",
        icon: "Image",
        color: "text-purple-600",
        bg: "bg-purple-50",
        border: "border-purple-200"
      },
      {
        id: "video",
        name: "Video",
        description: "Process video content",
        icon: "Video",
        color: "text-red-600",
        bg: "bg-red-50",
        border: "border-red-200"
      },
      {
        id: "gate",
        name: "Gate",
        description: "Conditional logic gate",
        icon: "GitBranch",
        color: "text-yellow-600",
        bg: "bg-yellow-50",
        border: "border-yellow-200"
      },
      {
        id: "loop",
        name: "Loop",
        description: "Loop/iteration control",
        icon: "Repeat",
        color: "text-indigo-600",
        bg: "bg-indigo-50",
        border: "border-indigo-200"
      },
      {
        id: "seed",
        name: "Seed",
        description: "Random seed generator",
        icon: "Hash",
        color: "text-pink-600",
        bg: "bg-pink-50",
        border: "border-pink-200"
      }
    ]

    // Register configurations
    moduleConfigs.forEach(config => {
      this.configs.set(config.id, config)
    })
  }

  registerModule(id: string, module: ModuleDefinition): void {
    this.modules.set(id, module)
    
    // Also update config if not already present
    if (!this.configs.has(id)) {
      this.configs.set(id, {
        id: module.meta.id,
        name: module.meta.name,
        description: module.meta.description,
        icon: module.meta.icon.name || "Box",
        color: module.meta.color,
        bg: module.meta.bg,
        border: module.meta.border,
        isStandard: module.meta.isStandard,
        panelTitle: module.meta.panelTitle
      })
    }
  }

  getModule(id: string): ModuleDefinition | undefined {
    return this.modules.get(id)
  }

  getModuleConfig(id: string): ModuleConfig | undefined {
    return this.configs.get(id)
  }

  getAllModules(): ModuleDefinition[] {
    return Array.from(this.modules.values())
  }

  getAllConfigs(): ModuleConfig[] {
    return Array.from(this.configs.values())
  }

  getModuleIds(): string[] {
    return Array.from(this.modules.keys())
  }

  async loadModuleDynamically(id: string): Promise<ModuleDefinition | null> {
    try {
      // This is a placeholder for dynamic module loading
      // In a real implementation, you could do:
      // const module = await import(`@/components/layout/modules/${id}.tsx`)
      // this.registerModule(id, module.default || module)
      // return this.getModule(id)
      
      console.warn(`[ModuleRegistry] Dynamic loading not implemented for module: ${id}`)
      return null
    } catch (error) {
      console.error(`[ModuleRegistry] Failed to load module ${id}:`, error)
      return null
    }
  }

  isModuleAvailable(id: string): boolean {
    return this.modules.has(id) || this.configs.has(id)
  }

  // Helper method to get modules by category
  getModulesByCategory(category: 'standard' | 'custom' | 'all' = 'all'): ModuleConfig[] {
    const configs = this.getAllConfigs()
    
    if (category === 'all') return configs
    if (category === 'standard') return configs.filter(config => config.isStandard)
    return configs.filter(config => !config.isStandard)
  }
}

// Export singleton instance
export const moduleRegistry = ModuleRegistry.getInstance()