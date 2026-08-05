import type { Project as PrismaProject, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

export interface StoredProject {
  id: string
  name: string
  description: string | null
  coverAssetId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateProjectInput {
  id?: string
  name: string
  description?: string
}

export interface UpdateProjectInput {
  name?: string
  /** 显式传 null 清空 */
  description?: string | null
  /** 项目封面，通常取某个生成结果。显式传 null 清空 */
  coverAssetId?: string | null
}

export interface ProjectStore {
  createProject(input: CreateProjectInput): Promise<StoredProject>
  getProject(projectId: string): Promise<StoredProject | null>
  /** 按最近更新时间倒序列出全部项目。 */
  listProjects(): Promise<StoredProject[]>
  /** 部分更新。project 不存在时抛 P2025。 */
  updateProject(projectId: string, input: UpdateProjectInput): Promise<StoredProject>
}

function toStoredProject(project: PrismaProject): StoredProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    coverAssetId: project.coverAssetId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export function createProjectStore(client: PrismaClient): ProjectStore {
  return {
    async createProject(input) {
      const project = await client.project.create({
        data: {
          ...(input.id === undefined ? {} : { id: input.id }),
          name: input.name,
          ...(input.description === undefined ? {} : { description: input.description }),
        },
      })
      return toStoredProject(project)
    },

    async getProject(projectId) {
      const project = await client.project.findUnique({ where: { id: projectId } })
      return project === null ? null : toStoredProject(project)
    },

    async listProjects() {
      const projects = await client.project.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      })
      return projects.map(toStoredProject)
    },

    async updateProject(projectId, input) {
      const project = await client.project.update({
        where: { id: projectId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.coverAssetId === undefined ? {} : { coverAssetId: input.coverAssetId }),
        },
      })
      return toStoredProject(project)
    },
  }
}

const defaultStore = createProjectStore(prisma)

export const createProject = defaultStore.createProject
export const getProject = defaultStore.getProject
export const listProjects = defaultStore.listProjects
export const updateProject = defaultStore.updateProject
