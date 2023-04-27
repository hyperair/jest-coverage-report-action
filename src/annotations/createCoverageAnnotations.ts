import { relative } from 'path';

import { Annotation } from './Annotation';
import { JsonReport, Location } from '../typings/JsonReport';
import { i18n } from '../utils/i18n';
import { isValidNumber } from '../utils/isValidNumber';

const getLocation = (
    start: Location = { line: 0 },
    end: Location = { line: 0 }
): {
    start_line: number;
    end_line: number;
    start_column?: number;
    end_column?: number;
} => ({
    start_line: Math.min(start.line, end.line),
    end_line: Math.max(end.line),
    ...(start.line === end.line && start.column != null && end.column != null
        ? {
              start_column: Math.max(1, Math.min(start.column, end.column)),
              end_column: Math.max(1, start.column, end.column),
          }
        : {}),
});

const deduplicateAnnotations = (
    annotations: Partial<Annotation>[]
): Partial<Annotation>[] => {
    const cmpAnnotations = (
        a: Partial<Annotation>,
        b: Partial<Annotation>
    ): 1 | 0 | -1 => {
        // [ [fieldName, defaultValue], ... ]
        const fields = [
            ['path', ''],
            ['start_line', 1],
            ['end_line', 1],
            ['start_column', 1],
            ['end_column', 1],
            ['annotation_level', ''],
            ['title', ''],
            ['message', ''],
        ] as const;

        for (const [field, defaultValue] of fields) {
            const aValue = a[field] ?? defaultValue;
            const bValue = b[field] ?? defaultValue;

            if (aValue < bValue) return -1;
            if (aValue > bValue) return 1;
        }

        return 0;
    };

    return annotations
        .sort(cmpAnnotations)
        .filter((value, index, array) => {
            // always keep the first element
            if (index === 0) return true;

            // skip elements that are equal to the previous
            return cmpAnnotations(value, array[index - 1]) !== 0;
        });
};

export const createCoverageAnnotations = (
    jsonReport: JsonReport
): Array<Annotation> => {
    const annotations: Partial<Annotation>[] = [];

    Object.entries(jsonReport.coverageMap).forEach(
        ([fileName, fileCoverage]) => {
            const normalizedFilename = relative(process.cwd(), fileName);
            const normalizedFileCoverage =
                'statementMap' in fileCoverage
                    ? fileCoverage
                    : fileCoverage.data;

            Object.entries(normalizedFileCoverage.statementMap).forEach(
                ([statementIndex, statementCoverage]) => {
                    if (normalizedFileCoverage.s[+statementIndex] === 0) {
                        annotations.push({
                            ...getLocation(
                                statementCoverage.start,
                                statementCoverage.end
                            ),
                            path: normalizedFilename,
                            annotation_level: 'warning',
                            title: i18n('notCoveredStatementTitle'),
                            message: i18n('notCoveredStatementMessage'),
                        });
                    }
                }
            );

            Object.entries(normalizedFileCoverage.branchMap).forEach(
                ([branchIndex, branchCoverage]) => {
                    if (branchCoverage.locations) {
                        branchCoverage.locations.forEach(
                            (location, locationIndex) => {
                                if (
                                    normalizedFileCoverage.b[+branchIndex][
                                        locationIndex
                                    ] === 0
                                ) {
                                    annotations.push({
                                        ...getLocation(
                                            location.start,
                                            location.end
                                        ),
                                        path: normalizedFilename,
                                        annotation_level: 'warning',
                                        title: i18n('notCoveredBranchTitle'),
                                        message: i18n(
                                            'notCoveredBranchMessage'
                                        ),
                                    });
                                }
                            }
                        );
                    }
                }
            );

            Object.entries(normalizedFileCoverage.fnMap).forEach(
                ([functionIndex, functionCoverage]) => {
                    if (normalizedFileCoverage.f[+functionIndex] === 0) {
                        annotations.push({
                            ...getLocation(
                                functionCoverage.decl.start,
                                functionCoverage.decl.end
                            ),
                            path: normalizedFilename,
                            annotation_level: 'warning',
                            title: i18n('notCoveredFunctionTitle'),
                            message: i18n('notCoveredFunctionMessage'),
                        });
                    }
                }
            );
        }
    );

    return deduplicateAnnotations(annotations).filter(
        (annotation): annotation is Annotation =>
            isValidNumber(annotation.start_line) &&
            isValidNumber(annotation.end_line)
    );
};
