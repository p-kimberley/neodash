// Components can call this to check if any extension is enabled. For example, to decide whether to all rule-based styling.
export const extensionEnabled = (extensions, name) => {
  return extensions && extensions[name] && extensions[name].active;
};

export async function validateQuery(query, driver, database) {
  /**
   * This function validates the query in input and returns True if valid, otherwise False
   */
  try {
    const toValidate = `EXPLAIN ${query}`;
    const session = driver.session({ database: database });
    const transaction = session.beginTransaction({ timeout: 20 * 1000, connectionTimeout: 2000 });
    await transaction.run(toValidate);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Whether a report's results can also be shown as a table ("View as table"): reports that draw query
 * results, except those that already are a table or raw results, or show a single value.
 */
export const canViewAsTable = (type: string, reportTypes: Record<string, any>) => {
  const reportType = reportTypes[type];
  return Boolean(
    reportType &&
      !reportType.textOnly &&
      reportType.maxRecords !== 1 &&
      !['table', 'json', 'value', 'select'].includes(type)
  );
};
