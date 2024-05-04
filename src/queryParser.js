function parseSelectQuery(query) {
    try {
        let isDistinct = false;

        if (query.toUpperCase().includes('SELECT DISTINCT')) {
            isDistinct = true;
            query = query.replace('SELECT DISTINCT', 'SELECT');
        }

        const selectRegex = /^SELECT\s(.*?)\sFROM\s(.*?)(?:\s(INNER|LEFT|RIGHT)\sJOIN\s(.*?)\sON\s(.*?))?(?:\sWHERE\s(.*?))?(?:\sGROUP\sBY\s(.*?))?(?:\sORDER\sBY\s(.*?))?(?:\sLIMIT\s(\d+))?$/i;

        const matches = query.match(selectRegex);

        if (!matches) {
            throw new Error(`Invalid SELECT format.`);
        }



        const fields = matches[1].split(',').map(field => field.trim());
        const table = matches[2].trim();
        const { joinType, joinTable, joinCondition } = parseJoinClause(query);
        const whereClause = matches[6] ? matches[6].trim() : null;
        const whereClauses = whereClause ? parseWhereClause(whereClause) : [];
        const groupByFields = matches[7] ? matches[7].split(',').map(field => field.trim()) : null;
        const orderByFields = matches[8] ? matches[8].split(',').map(field => {
            const [fieldName, order] = field.trim().split(/\s+/);
            return { fieldName, order: order ? order.toUpperCase() : 'ASC' };
        }) : null;
        const hasAggregateWithoutGroupBy = hasAggregateWithoutGroupBy_(fields) && !groupByFields;
        const limit = matches[9] ? parseInt(matches[9]) : null;

        return { fields, table, whereClauses, groupByFields, orderByFields, joinType, joinTable, joinCondition, hasAggregateWithoutGroupBy, limit ,isDistinct};
    } catch (error) {
        throw new Error(`Query parsing error: ${error.message}`);
    }
}

function hasAggregateWithoutGroupBy_(fields) {
    const aggregateRegex = /(\bCOUNT\b|\bAVG\b|\bSUM\b|\bMIN\b|\bMAX\b)\s*\(\s*(\*|\w+)\s*\)/i
    return fields.some(field => aggregateRegex.test(field));
}

function parseWhereClause(whereClause) {
    const conditions = whereClause.split(" AND ").map((condition) => {
        if (condition.includes(" LIKE ")) {
        
            const [field,  pattern] = condition.split(/\sLIKE\s/i);
            return { field: field.trim(), operator: "LIKE", value: pattern.trim(). replace(/['"]/g, '') };
        } else {
            const [field, operator, value] = condition.trim().split(/\s+/);
            return { field, operator, value };
        }
    });
    return conditions;
}

function parseJoinClause(query) {
    const joinRegex = /\s(INNER|LEFT|RIGHT) JOIN\s(.+?)\sON\s([\w.]+)\s*=\s*([\w.]+)/i;
    const joinMatch = query.match(joinRegex);

    if (joinMatch) {
        return {
            joinType: joinMatch[1].trim(),
            joinTable: joinMatch[2].trim(),
            joinCondition: {
                left: joinMatch[3].trim(),
                right: joinMatch[4].trim()
            }
        };
    }

    return {
        joinType: null,
        joinTable: null,
        joinCondition: null
    };
}



function parseINSERTQuery(query) {
    const insertRegex = /^INSERT INTO\s+(\w+)\s+\((.*?)\)\s+VALUES\s+\((.*?)\)$/i;

    const match = query.match(insertRegex);
    if (!match) {
        throw new Error("Invalid INSERT query format.");
    }

    const table = match[1];
    const columns = match[2].split(",").map((column) => column.trim().replace(/['"]/g, ''));
    const values = match[3].split(",").map((value) => value.trim().replace(/['"]/g, ''));

    return {
        type: "INSERT",
        table,
        columns,
        values,
    };
}

function parseDELETEQuery(query) {
    try {
        const deleteRegex = /^DELETE\sFROM\s(\w+)\s(?:WHERE\s(.+))?$/i;
        const matches = query.match(deleteRegex);

        if (!matches) {
            throw new Error(`Invalid DELETE statement format.`);
        }

        const table = matches[1].trim();
        const whereClause = matches[2] ? matches[2].trim().replace(/['"]/g, '') : null;
        const whereClauses = [];

        if (whereClause) {
            // Splitting the where clause into individual conditions
            const conditions = whereClause.split(/\s+AND\s+/);
            conditions.forEach(condition => {
                const [column, operator, value] = condition.split(/\s+/);
                whereClauses.push({ column, operator, value });
            });
        }

        return { type: 'DELETE', table, whereClauses };
    } catch (error) {
        throw new Error(`Query parsing error: ${error.message}`);
    }
}


module.exports = { parseSelectQuery,parseJoinClause,parseINSERTQuery,parseDELETEQuery };