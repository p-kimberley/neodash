import React from 'react';

/**
 * Gives reports the query driver (an ApiDriver, which sends every query through the NeoDash backend).
 * This replaces use-neo4j's context of the same shape; only `driver` is used.
 */
export interface Neo4jContextState {
  driver?: any;
  config?: any;
  database?: string;
  updateConnection?: (config: any) => void;
  setDatabase?: (database: string) => void;
}

export const Neo4jContext = React.createContext<Neo4jContextState>({});
