# Project Documentation

This document provides an overview of the graph-app project, its structure, technologies, and core features.

## Overview

The graph-app project appears to be a web application built with Next.js, featuring a robust backend for managing jobs, executing workflows, handling user authentication, and interacting with a database via a repository pattern. It likely provides a visual interface for graph-based operations or workflows.

## Directory Structure

The project is organized into several key directories:

-   **`/app`**: Contains the core Next.js application code, including:
    -   **`/api`**: Backend API routes for various functionalities such as authentication (`auth`), job management (`jobs`), task execution (`execute`), user data (`user`), and file uploads (`upload`).
    -   **`/middleware`**: Application middleware, including error handling.
    -   **`/repositories`**: Data access layer implementing the repository pattern for database interactions.
    -   **`/services`**: Business logic layer that orchestrates operations using repositories.
    -   Root files (`layout.tsx`, `page.tsx`, `providers.tsx`, `globals.css`) define the application's structure, main page, and global context.
-   **`/components`**: Contains reusable UI components, organized into subdirectories like `layout`, `canvas`, `node_editor`, and `ui`.
-   **`/hooks`**: Custom React hooks used throughout the application.
-   **`/lib`**: Utility functions and helper modules (e.g., for image compression, prompt resolution, database connection).
-   **`/prisma`**: Contains Prisma schema and migration files, indicating the use of Prisma ORM for database management.
-   **`/public`**: Static assets for the application.
-   **`/types`**: TypeScript type definitions.
-   **`/data`**: Potentially for data fixtures or configurations.

## Key Technologies

-   **Framework**: Next.js (indicated by `next.config.ts` and `app/` directory structure).
-   **Language**: TypeScript.
-   **Database ORM**: Prisma (indicated by `prisma/` directory and schema).
-   **UI Components**: Likely a component library is used, suggested by `/components/ui/`.
-   **State Management**: Custom hooks and potentially React Context (implied by `providers.tsx`).

## Core Features

Based on the file structure, the application likely supports the following core features:

-   **User Authentication**: Handling user sign-up, login, and session management.
-   **Job Management**: Creating, tracking, and managing jobs.
-   **Workflow Execution**: Defining and executing complex workflows, possibly visually.
-   **Task Execution**: Running individual nodes or batches of tasks.
-   **Data Persistence**: Storing and retrieving data related to users, jobs, and execution logs.
-   **File Uploads**: Functionality to upload files.
-   **Visual Interface**: Components like `canvas` and `node_editor` suggest a graphical user interface for building or interacting with workflows.
