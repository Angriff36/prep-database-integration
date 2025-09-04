# Prep Chef Database Integration

**Standalone database services and testing environment**

This repository contains all database integration logic, connection management, and testing utilities for the Prep Chef application. Perfect for debugging database issues independently.

## 🎯 Purpose

This is a **debugging-focused** standalone repository that isolates all database operations from the main PrepBeta monorepo. It allows for independent testing and debugging of database issues without UI complexity.

## 🚀 Quick Start

```bash
npm install
npm run test-db
```
Opens database testing environment at `http://localhost:3007`

## 🗄️ Available Services

- **Supabase Connection**: Connection testing and debugging utilities
- **RLS Policy Testing**: Row-Level Security validation and troubleshooting
- **Real-time Subscriptions**: WebSocket connection testing
- **Data Migration**: Schema updates and data migration scripts
- **Query Testing**: SQL query validation and performance testing
- **Auth Integration**: Database authentication flow testing

## 🔍 Debugging Features

- **Connection Diagnostics**: Test database connectivity and configuration
- **RLS Debugger**: Validate row-level security policies
- **Real-time Monitor**: Debug WebSocket connections and subscriptions
- **Query Profiler**: Analyze slow queries and optimization
- **Schema Validator**: Check table structure and relationships
- **Mock Data Generator**: Create test data for development

## 🔄 Integration with Main App

This repository is mirrored from `PrepBeta/packages/data/` and `PrepBeta/src/services/`. 

### Debugging Workflow:
1. **Isolate issue** in this standalone environment
2. **Test fixes** without UI interference
3. **Validate solutions** with real database calls
4. **Copy fixes** back to main PrepBeta repo
5. **Verify** integration in full app

## 🔧 Development

- Supabase client with debug logging
- Connection pooling and retry logic
- Error handling and validation
- Performance monitoring
- Schema migration utilities
- Test data seeding

## 🔥 Perfect for Database Debugging

Import this repository directly into Bolt or use locally:
```
https://github.com/Angriff36/prep-database-integration
```

**Focus on database issues without UI complexity!**