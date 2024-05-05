const { parseSelectQuery,parseINSERTQuery,parseDELETEQuery } = require("./queryParser");
const {readCSV,writeCSV} = require("./csvReader");

function performInnerJoin(data, joinData, joinCondition, fields, table) {
  return data.flatMap((mainRow) => {
    return joinData
      .filter((joinRow) => {
        const mainValue = mainRow[joinCondition.left.split(".")[1]];
        const joinValue = joinRow[joinCondition.right.split(".")[1]];
        return mainValue === joinValue;
      })
      .map((joinRow) => {
        return fields.reduce((acc, field) => {
          const [tableName, fieldName] = field.split(".");
          acc[field] =
            tableName === table ? mainRow[fieldName] : joinRow[fieldName];
          return acc;
        }, {});
      });
  });
}

function performLeftJoin(data, joinData, joinCondition, fields, table) {
  return data.flatMap((mainRow) => {
    const matchingJoinRows = joinData.filter((joinRow) => {
      const mainValue = getValueFromRow(mainRow, joinCondition.left);
      const joinValue = getValueFromRow(joinRow, joinCondition.right);
      return mainValue === joinValue;
    });

    if (matchingJoinRows.length === 0) {
      return [createResultRow(mainRow, null, fields, table, true)];
    }

    return matchingJoinRows.map((joinRow) =>
      createResultRow(mainRow, joinRow, fields, table, true),
    );
  });
}

function getValueFromRow(row, compoundFieldName) {
  const [tableName, fieldName] = compoundFieldName.split(".");
  return row[`${tableName}.${fieldName}`] || row[fieldName];
}

function performRightJoin(data, joinData, joinCondition, fields, table) {
  // Cache the structure of a main table row (keys only)
  const mainTableRowStructure =
    data.length > 0
      ? Object.keys(data[0]).reduce((acc, key) => {
          acc[key] = null; // Set all values to null initially
          return acc;
        }, {})
      : {};

  return joinData.map((joinRow) => {
    const mainRowMatch = data.find((mainRow) => {
      const mainValue = getValueFromRow(mainRow, joinCondition.left);
      const joinValue = getValueFromRow(joinRow, joinCondition.right);
      return mainValue === joinValue;
    });

    // Use the cached structure if no match is found
    const mainRowToUse = mainRowMatch || mainTableRowStructure;

    // Include all necessary fields from the 'student' table
    return createResultRow(mainRowToUse, joinRow, fields, table, true);
  });
}

function createResultRow(
  mainRow,
  joinRow,
  fields,
  table,
  includeAllMainFields,
) {
  const resultRow = {};

  if (includeAllMainFields) {
    // Include all fields from the main table
    Object.keys(mainRow || {}).forEach((key) => {
      const prefixedKey = `${table}.${key}`;
      resultRow[prefixedKey] = mainRow ? mainRow[key] : null;
    });
  }

  // Now, add or overwrite with the fields specified in the query
  fields.forEach((field) => {
    const [tableName, fieldName] = field.includes(".")
      ? field.split(".")
      : [table, field];
    resultRow[field] =
      tableName === table && mainRow
        ? mainRow[fieldName]
        : joinRow
          ? joinRow[fieldName]
          : null;
  });

  return resultRow;
}

function applyGroupBy(data, groupByFields, fields, hasAggregateWithoutGroupBy) {
  const groupedData = {};

  for (const row of data) {
    const groupKey = groupByFields
      ? groupByFields.map((field) => row[field]).join("|")
      : hasAggregateWithoutGroupBy
        ? "AGGREGATE"
        : "";

    if (!groupedData[groupKey]) {
      groupedData[groupKey] = {
        count: 0,
        sum: {},
        avg: {},
        min: {},
        max: {},
        rows: [],
      };
    }

    groupedData[groupKey].count++;
    groupedData[groupKey].rows.push(row);

    for (const field of fields) {
      const [, functionName, fieldName] = field.match(
        /^(COUNT|SUM|AVG|MIN|MAX)\((.+)\)$/,
      ) || [null, null, field];

      if (
        functionName === "SUM" ||
        functionName === "AVG" ||
        functionName === "MIN" ||
        functionName === "MAX"
      ) {
        const value = parseFloat(row[fieldName]);
        if (!isNaN(value)) {
          if (!groupedData[groupKey].sum[field]) {
            groupedData[groupKey].sum[field] = 0;
            groupedData[groupKey].min[field] = Infinity;
            groupedData[groupKey].max[field] = -Infinity;
          }

          groupedData[groupKey].sum[field] += value;
          groupedData[groupKey].min[field] = Math.min(
            groupedData[groupKey].min[field],
            value,
          );
          groupedData[groupKey].max[field] = Math.max(
            groupedData[groupKey].max[field],
            value,
          );
        }
      }
    }
  }

  const result = Object.values(groupedData).map((group) => {
    const aggregatedRow = {};
    for (const field of fields) {
      const [, functionName, fieldName] = field.match(
        /(\w+)\((\*|\w+)\)/,
      ) || [null, null, field];
      if (functionName === "COUNT") {
        if (fieldName === "*") {
          aggregatedRow[field] = hasAggregateWithoutGroupBy
            ? group.count
            : group.rows.length;
        } else {
          aggregatedRow[field] = group.rows.filter(
            (row) => row[fieldName] !== null,
          ).length;
        }
      } else if (functionName === "SUM") {
        aggregatedRow[field] = group.sum[field] || 0;
      } else if (functionName === "AVG") {
        aggregatedRow[field] =
          group.sum[field] !== undefined
            ? group.sum[field] /
              group.rows.filter((row) => row[fieldName] !== null).length
            : 0;
      } else if (functionName === "MIN") {
        aggregatedRow[field] =
          group.min[field] !== Infinity ? group.min[field] : null;
      } else if (functionName === "MAX") {
        aggregatedRow[field] =
          group.max[field] !== -Infinity ? group.max[field] : null;
      } else {
        aggregatedRow[field] = group.rows[0][field];
      }
    }
    return aggregatedRow;
  });

  return result;
}

function evaluateCondition(row, clause) {
  const { field, operator, value } = clause;
  const cleanedValue = parseValue(value); // Remove single quotes and handle quoted values

  const fieldValue = parseValue(row[field]);

  if (operator === 'LIKE') {
    // Transform SQL LIKE pattern to JavaScript RegExp pattern
    const regexPattern = '^' + value.replace(/%/g, '.*').replace(/_/g, '.') + '$';
    const regex = new RegExp(regexPattern, 'i'); // 'i' for case-insensitive matching
    console.log(regex)
    return regex.test(row[field]);
}

  switch (operator) {
    case "=":
      return fieldValue === cleanedValue;
    case ">":
      return fieldValue > cleanedValue;
    case "<":
      return fieldValue < cleanedValue;
    case ">=":
      return fieldValue >= cleanedValue;
    case "<=":
      return fieldValue <= cleanedValue;
    case "!=":
      return fieldValue !== cleanedValue;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

// Helper function to parse value based on its apparent type
function parseValue(value) {
  // Return null or undefined as is
  if (value === null || value === undefined) {
    return value;
  }

  // If the value is a string enclosed in single or double quotes, remove them
  if (
    typeof value === "string" &&
    ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"')))
  ) {
    value = value.substring(1, value.length - 1);
  }

  // Check if value is a number
  if (!isNaN(value) && value.trim() !== "") {
    return Number(value);
  }
  // Assume value is a string if not a number
  return value;
}

async function executeSELECTQuery(query) {
  try {
    const {
      fields,
      table,
      whereClauses,
      joinType,
      joinTable,
      joinCondition,
      groupByFields,
      hasAggregateWithoutGroupBy,
      orderByFields,
      limit,
      isDistinct
    } = parseSelectQuery(query);
    
    // console.log("Parsed Query:", parseSelectQuery(query)); // Logging the parsed query for debugging
    
    let data = await readCSV(`${table}.csv`);
    // console.log("Initial data:", data);
    
    // Perform INNER JOIN if specified
    if (joinTable && joinCondition) {
      const joinData = await readCSV(`${joinTable}.csv`);
      switch (joinType.toUpperCase()) {
        case "INNER":
          // console.log("Performing INNER JOIN...");
          data = performInnerJoin(data, joinData, joinCondition, fields, table);
          break;
        case "LEFT":
          // console.log("Performing LEFT JOIN...");
          data = performLeftJoin(data, joinData, joinCondition, fields, table);
          break;
        case "RIGHT":
          // console.log("Performing RIGHT JOIN...");
          data = performRightJoin(data, joinData, joinCondition, fields, table);
          break;
        default:
          throw new Error(`Unsupported JOIN type: ${joinType}`);
      }
    }
    
    // Apply WHERE clause filtering after JOIN (or on the original data if no join)
    let filteredData =
      whereClauses.length > 0
        ? data.filter((row) =>
            whereClauses.every((clause) => evaluateCondition(row, clause)),
          )
        : data;
    
    let groupResults = filteredData;
    // console.log("Has Aggregate Without Group By:", hasAggregateWithoutGroupBy);
    
    if (hasAggregateWithoutGroupBy) {
      // console.log("Handling Aggregate Without Group By...");
      // Special handling for queries like 'SELECT COUNT(*) FROM table'
      const result = {};
    
      // console.log("Filtered Data:", filteredData);
    
      fields.forEach((field) => {
        const match = /(\w+)\((\*|\w+)\)/.exec(field);
        if (match) {
          const [, aggFunc, aggField] = match;
          switch (aggFunc.toUpperCase()) {
            case "COUNT":
              result[field] = filteredData.length;
              break;
            case "SUM":
              result[field] = filteredData.reduce(
                (acc, row) => acc + parseFloat(row[aggField]),
                0,
              );
              break;
            case "AVG":
              result[field] =
                filteredData.reduce(
                  (acc, row) => acc + parseFloat(row[aggField]),
                  0,
                ) / filteredData.length;
              break;
            case "MIN":
              result[field] = Math.min(
                ...filteredData.map((row) => parseFloat(row[aggField])),
              );
              break;
            case "MAX":
              result[field] = Math.max(
                ...filteredData.map((row) => parseFloat(row[aggField])),
              );
              break;
            // Additional aggregate functions can be handled here
          }
        }
      });
    
      if (isDistinct) {
        // console.log("Handling DISTINCT...");
        result = [...new Map(result.map(item => [fields.map(field => item[field]).join('|'), item])).values()];
      }
    
      if (orderByFields) {
        // console.log("Sorting results...");
        const orderByGroup = (a, b) => {
          for (let { fieldName, order } of orderByFields) {
            if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
            if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
          }
          return 0;
        };
        // Sort the result
        return [result].sort(orderByGroup);
      } else {
        return [result];
      }
      // Add more cases here if needed for other aggregates
    } else if (groupByFields) {
      // console.log("Applying Group By...");
      groupResults = applyGroupBy(filteredData, groupByFields, fields);
    
      // Order them by the specified fields
      let orderedResults = groupResults;
      if (orderByFields) {
        // console.log("Sorting results...");
        orderedResults = groupResults.sort((a, b) => {
          for (let { fieldName, order } of orderByFields) {
            if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
            if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
          }
          return 0;
        });
      }
    
      if (isDistinct) {
        // console.log("Handling DISTINCT... elseif");
        orderedResults = [...new Map(orderedResults.map(item => [fields.map(field => item[field]).join('|'), item])).values()];
      }
      
      if (limit !== null) {
        // console.log("Applying Limit...");
        orderedResults = orderedResults.slice(0, limit);
      }
    
      return orderedResults;
    } else {
      // Order them by the specified fields
      let orderedResults = groupResults;
      if (orderByFields) {
        // console.log("Sorting results...");
        orderedResults = groupResults.sort((a, b) => {
          for (let { fieldName, order } of orderByFields) {
            if (a[fieldName] < b[fieldName]) return order === "ASC" ? -1 : 1;
            if (a[fieldName] > b[fieldName]) return order === "ASC" ? 1 : -1;
          }
          return 0;
        });
      }
    
      if (isDistinct) {
        // console.log("Handling DISTINCT...else");
        orderedResults = [...new Map(orderedResults.map(item => [fields.map(field => item[field]).join('|'), item])).values()];
      }
    
      if (limit !== null) {
        // console.log("Applying Limit...");
        orderedResults = orderedResults.slice(0, limit);
      }
    
      // Select the specified fields
      return orderedResults.map((row) => {
        const selectedRow = {};
        fields.forEach((field) => {
          // Assuming 'field' is just the column name without table prefix
          selectedRow[field] = row[field];
        });
        return selectedRow;
      });
    }
    
    
  }
  catch (error) {
     // Log error and provide user-friendly message
     console.error("Error executing query:", error);
     throw new Error(`Error executing query: ${error.message}`);
  }
}

async function executeINSERTQuery(query) {
  try {
      const {
          type,
          table,
          columns,
          values,
      } = parseINSERTQuery(query);

      // Validate if the provided columns and values arrays have the same length
      if (columns.length !== values.length) {
          throw new Error(`Number of columns (${columns.length}) does not match the number of values (${values.length}).`);
      }

      // Create an object with key-value pairs of column names and their respective values
      const rowData = {};
      for (let i = 0; i < columns.length; i++) {
          rowData[columns[i]] = values[i];
      }

      // Prepare data for writing to CSV
      const dataToWrite = [rowData];

      // Define the file path where the CSV will be written
      const filePath = `${table}.csv`;

      // Write data to CSV
      await writeCSV(filePath, dataToWrite);

      return dataToWrite.length; // Return the number of rows inserted
  } catch (error) {
      console.error("Error executing INSERT query:", error);
      throw new Error(`Error executing INSERT query: ${error.message}`);
  }
}


async function executeDELETEQuery(query) {
    try {
        // Parsing the DELETE query
        const { table, whereClauses } = parseDELETEQuery(query);

        // Reading data from CSV
        let data = await readCSV(`${table}.csv`);

        if (whereClauses.length > 0) {
            // Filter out the rows that meet the where clause conditions
            data = data.filter(row => {
                for (const { column, operator, value } of whereClauses) {
                    if (evaluateCondition(row, { field: column, operator, value })) {
                        return false;
                    }
                }
                return true;
            });
        } else {
            // If no where clause, clear the entire table
            data = [];
        }

        // Save the updated data back to the CSV file
        await writeCSV(`${table}.csv`, data);

        return { message: "Rows deleted successfully." };
    } catch (error) {
        console.error("Error executing DELETE query:", error);
        throw new Error(`Error executing DELETE query: ${error.message}`);
    }
}




  

// (async () => {
//   try {
//     const data = await executeDELETEQuery(
//       "DELETE FROM courses WHERE course_id = '2'",
//     );
    // console.log("Result:", data);
//   } catch (error) {
//     console.error("Error:", error);
//   }
// })();

module.exports = {executeSELECTQuery,executeINSERTQuery,executeDELETEQuery};