import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from "react-router"
import { useSelector } from 'react-redux'
import { useDispatch } from 'react-redux'
import {
    Button,
    Card,
    CardHeader,
    CardBody,
    PageSection,
    Pagination,
    Toolbar,
    ToolbarGroup,
    ToolbarItem,
    Tooltip,
    Checkbox,
} from '@patternfly/react-core';
import {
    EditIcon,
    TrashIcon,
    WarningTriangleIcon,
} from '@patternfly/react-icons';
import { NavLink } from 'react-router-dom';

import { Duration } from 'luxon';
import { toEpochMillis } from '../../utils'

import { byTest } from './actions';
import * as selectors from './selectors';
import { tokenSelector } from '../../auth'
import { alertAction } from '../../alerts'

import { fetchTest } from '../tests/actions';
import { get } from '../tests/selectors';

import Table from '../../components/Table';
import { CellProps, UseTableOptions, UseRowSelectInstanceProps, UseRowSelectRowProps, Column, UseSortByColumnOptions } from 'react-table';
import { Run } from './reducers';
import { Description, ExecutionTime, Menu, RunTags } from './components'
import { Test } from '../tests/reducers'

type C = CellProps<Run> & UseTableOptions<Run> & UseRowSelectInstanceProps<Run> & { row:  UseRowSelectRowProps<Run> }

//TODO how to prevent rendering before the data is loaded? (we just have start,stop,id)
const renderCell = (render: string | Function | undefined) => (arg: C) => {
    const { cell: { value, row: { index } }, data, column } = arg;
    if (!render) {
        if (typeof value === "object") {
            return JSON.stringify(value)
        }
        return value
    } else if (typeof render === "string") {
        return (<Tooltip content={ "Render failure: " + render } ><WarningTriangleIcon style={{color: "#a30000"}} /></Tooltip>);
    }
    const token = useSelector(tokenSelector)
    try {
        const useValue = (value === null || value === undefined) ? (data[index] as any)[column.id.toLowerCase()] : value;
        const rendered = render(useValue, data[index], token)
        if (!rendered) {
            return "-"
        } else if (typeof rendered === "string") {
            //this is a hacky way to see if it looks like html :)
            if (rendered.trim().startsWith("<") && rendered.trim().endsWith(">")) {
                //render it as html
                return (<div dangerouslySetInnerHTML={{ __html: rendered }} />)
            } else {
                return rendered;
            }
        } else {
            return rendered;
        }
    } catch (e) {
        console.error(e)
        return "--"
    }
}

type RunColumn = Column<Run> & UseSortByColumnOptions<Run>

const staticColumns: RunColumn[] = [
    {
        Header: "",
        id: "selection",
        disableSortBy: true,
        Cell: ({ row, selectedFlatRows }: C) => {
           const props = row.getToggleRowSelectedProps()
           delete props.indeterminate
           return (<input type="checkbox" {... props}
                          disabled={ !row.isSelected && selectedFlatRows.length >= 2 }/>)
        },
    }, {
        Header: "Id",
        accessor: "id",
        Cell: (arg: C) => {
            const { cell: { value } } = arg;
            return (<><NavLink to={`/run/${value}`}>{value}</NavLink>
               { arg.row.original.trashed &&
                  <TrashIcon style={{ fill: "#888", marginLeft: "10px" }} /> }
            </>)
        }
    }, {
        Header: "Executed",
        accessor: "start",
        Cell: (arg: C) => ExecutionTime(arg.row.original),
    }, {
        Header:"Duration",
        id: "(stop - start)",
        accessor: (run: Run) => Duration.fromMillis(toEpochMillis(run.stop) - toEpochMillis(run.start)).toFormat("hh:mm:ss.SSS")
    }, {
        Header: "Schema",
        accessor: "schema",
        disableSortBy: true,
        Cell: (arg: C) => {
            const { cell: { value } } = arg;
            // LEFT JOIN results in schema.id == 0
            if (value) {
               return Object.keys(value).map(key => (<><NavLink key={key} to={`/schema/${key}`}>{value[key]}</NavLink>&nbsp;</>))
            } else {
               return "--"
            }
        }
    }, {
        Header: "Tags",
        accessor: "tags",
        disableSortBy: true,
        Cell: (arg: C) => RunTags(arg.cell.value)
    }, {
        Header: "Description",
        accessor: "description",
        Cell: (arg: C) => Description(arg.cell.value)
    }
]

const menuColumn: RunColumn = {
    Header:"Actions",
    id: "actions",
    accessor: "id",
    disableSortBy: true,
    Cell: (arg: CellProps<Run, number>) => Menu(arg.row.original)
}

function hasNonTrivialAccessor(test: Test, vcIndex: number) {
    if (!test.defaultView) {
        return false;
    }
    const vc = test.defaultView.components[vcIndex]
    return vc.accessors.indexOf("[]") >= 0 ||
        vc.accessors.indexOf(";") >= 0 ||
        vc.accessors.indexOf(",") >= 0
}

export default () => {
    const { testId: stringTestId } = useParams();
    const testId = parseInt(stringTestId)

    const test = useSelector(get(testId))
    const [columns, setColumns] = useState((test && test.defaultView) ? test.defaultView.components : [])
    const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({})
    const [page, setPage] = useState(1)
    const [perPage, setPerPage] = useState(20)
    const [sort, setSort] = useState("start")
    const [direction, setDirection] = useState("descending")
    const pagination = { page, perPage, sort, direction }
    const tableColumns = useMemo(() => {
        const rtrn = [ ...staticColumns ]
        columns.forEach((col, index) => {
             rtrn.push({
                 Header: col.headerName,
                 accessor: (run: Run) => run.view && run.view[index],
                 // In general case we would have to calculate the final sortable cell value
                 // in database, or fetch all runs and sort in server doing the rendering
                 disableSortBy: (!!col.render && col.render !== "") || !test || hasNonTrivialAccessor(test, index),
                 id: test ? "view_data:" + index + ":" + test.defaultView?.components[index].accessors : undefined,
                 Cell: renderCell(col.render)
             })
        })
        rtrn.push(menuColumn)
        return rtrn;
    }, [columns]);

    const dispatch = useDispatch();
    const [ showTrashed, setShowTrashed ] = useState(false)
    const runs = useSelector(selectors.testRuns(testId, pagination, showTrashed));
    const runCount = useSelector(selectors.count)
    useEffect(() => {
        dispatch(fetchTest(testId));
    }, [dispatch, testId])
    useEffect(() => {
        dispatch(byTest(testId, pagination, showTrashed))
    }, [dispatch, showTrashed, page, perPage, sort, direction])
    useEffect(() => {
        document.title = (test ? test.name : "Loading...") + " | Horreum"
        if (test && test.defaultView) {
            setColumns(test.defaultView.components)
        }
    }, [test])
    const isLoading = useSelector(selectors.isLoading)

    const [actualCompareUrl, compareError] = useMemo(() => {
       if ( test && test.compareUrl && typeof test.compareUrl === "function" ) {
          try {
             const rows = Object.keys(selectedRows).map(id => runs ? runs[parseInt(id)].id : [])
             if (rows.length >= 2) {
                return [test.compareUrl(rows), undefined]
             }
          } catch (e) {
             return [undefined, e]
          }
       }
       return [undefined, undefined]
    }, [test ? test.compareUrl : undefined, runs, selectedRows])
    const hasError = !!compareError
    useEffect(() => {
       if (compareError) {
          dispatch(alertAction("COMPARE_FAILURE", "Compare function failed", compareError))
       }
    }, [hasError])

    return (
        <PageSection>
            <Card>
                <CardHeader>
                    <Toolbar className="pf-l-toolbar pf-u-justify-content-space-between pf-u-mx-xl pf-u-my-md"
                             style={{ width: "100%", display: "flex" }}>
                        <ToolbarGroup style={{ flexGrow: 100 }}>
                            <ToolbarItem className="pf-u-mr-xl">{`Test: ${test && test.name || testId}`}</ToolbarItem>
                        </ToolbarGroup>
                        { test && test.compareUrl &&
                        <ToolbarGroup>
                           <ToolbarItem>
                              <Button variant="primary"
                                      component="a"
                                      target="_blank"
                                      href={ actualCompareUrl || "" }
                                      isDisabled={ !actualCompareUrl }>Compare runs</Button>
                           </ToolbarItem>
                        </ToolbarGroup>
                        }
                        <ToolbarGroup>
                            <ToolbarItem>
                                <Checkbox id="showTrashed" aria-label="show trashed runs"
                                          label="Show trashed runs"
                                          isChecked={ showTrashed }
                                          onChange={ setShowTrashed } />
                            </ToolbarItem>
                        </ToolbarGroup>
                        <ToolbarGroup>
                            <NavLink to={ `/test/${testId}` } ><EditIcon /></NavLink>
                        </ToolbarGroup>
                    </Toolbar>
                    <Pagination
                        itemCount={runCount}
                        perPage={perPage}
                        page={page}
                        onSetPage={(e, p) => setPage(p)}
                        onPerPageSelect={(e, pp) => setPerPage(pp)}
                    />
                </CardHeader>
                <CardBody>
                    <Table
                        columns={tableColumns}
                        data={runs || []}
                        sortBy={[{id: sort, desc: direction === "descending"}]}
                        onSortBy={ (order) => {
                            if (order.length > 0 && order[0]) {
                                setSort(order[0].id)
                                setDirection(order[0].desc ? "descending" : "ascending")
                            }
                        }}
                        isLoading={isLoading}
                        selected={selectedRows}
                        onSelected={setSelectedRows}
                    />
                </CardBody>
            </Card>
        </PageSection>
    )
}
