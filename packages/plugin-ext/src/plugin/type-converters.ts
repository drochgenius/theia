// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as theia from '@theia/plugin';
import * as lstypes from '@theia/core/shared/vscode-languageserver-protocol';
import { URI } from './types-impl';
import * as rpc from '../common/plugin-api-rpc';
import {
    DecorationOptions, EditorPosition, Plugin, Position, WorkspaceTextEditDto, WorkspaceFileEditDto, Selection, TaskDto, WorkspaceEditDto
} from '../common/plugin-api-rpc';
import * as model from '../common/plugin-api-rpc-model';
import { LanguageFilter, LanguageSelector, RelativePattern } from '@theia/callhierarchy/lib/common/language-selector';
import { isMarkdownString, MarkdownString } from './markdown-string';
import * as types from './types-impl';
import { UriComponents } from '../common/uri-components';
import { isReadonlyArray } from '../common/arrays';

const SIDE_GROUP = -2;
const ACTIVE_GROUP = -1;
const BUILD_GROUP = 'build';
const TEST_GROUP = 'test';

export function toViewColumn(ep?: EditorPosition): theia.ViewColumn | undefined {
    if (typeof ep !== 'number') {
        return undefined;
    }

    if (ep === EditorPosition.ONE) {
        return <number>types.ViewColumn.One;
    } else if (ep === EditorPosition.TWO) {
        return <number>types.ViewColumn.Two;
    } else if (ep === EditorPosition.THREE) {
        return <number>types.ViewColumn.Three;
    } else if (ep === EditorPosition.FOUR) {
        return <number>types.ViewColumn.Four;
    } else if (ep === EditorPosition.FIVE) {
        return <number>types.ViewColumn.Five;
    } else if (ep === EditorPosition.SIX) {
        return <number>types.ViewColumn.Six;
    } else if (ep === EditorPosition.SEVEN) {
        return <number>types.ViewColumn.Seven;
    } else if (ep === EditorPosition.EIGHT) {
        return <number>types.ViewColumn.Eight;
    } else if (ep === EditorPosition.NINE) {
        return <number>types.ViewColumn.Nine;
    }

    return undefined;
}

export function fromViewColumn(column?: theia.ViewColumn): number {
    if (typeof column === 'number' && column >= types.ViewColumn.One) {
        return column - 1;
    }

    if (column! === <number>types.ViewColumn.Beside) {
        return SIDE_GROUP;
    }

    return ACTIVE_GROUP;
}

export function toWebviewPanelShowOptions(options: theia.ViewColumn | theia.WebviewPanelShowOptions): theia.WebviewPanelShowOptions {
    if (typeof options === 'object') {
        const showOptions = options as theia.WebviewPanelShowOptions;
        return {
            area: showOptions.area ? showOptions.area : types.WebviewPanelTargetArea.Main,
            viewColumn: showOptions.viewColumn ? fromViewColumn(showOptions.viewColumn) : undefined,
            preserveFocus: showOptions.preserveFocus ? showOptions.preserveFocus : false
        };
    }

    return {
        area: types.WebviewPanelTargetArea.Main,
        viewColumn: fromViewColumn(options as theia.ViewColumn),
        preserveFocus: false
    };
}

export function toSelection(selection: Selection): types.Selection {
    const { selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn } = selection;
    const start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
    const end = new types.Position(positionLineNumber - 1, positionColumn - 1);
    return new types.Selection(start, end);
}

export function fromSelection(selection: types.Selection): Selection {
    const { active, anchor } = selection;
    return {
        selectionStartLineNumber: anchor.line + 1,
        selectionStartColumn: anchor.character + 1,
        positionLineNumber: active.line + 1,
        positionColumn: active.character + 1
    };
}

export function toRange(range: model.Range): types.Range {
    const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
    return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
}

export function fromRange(range: undefined): undefined;
export function fromRange(range: theia.Range): model.Range;
export function fromRange(range: theia.Range | undefined): model.Range | undefined;
export function fromRange(range: theia.Range | undefined): model.Range | undefined {
    if (!range) {
        return undefined;
    }
    const { start, end } = range;
    return {
        startLineNumber: start.line + 1,
        startColumn: start.character + 1,
        endLineNumber: end.line + 1,
        endColumn: end.character + 1
    };
}

export function fromPosition(position: types.Position): Position {
    return { lineNumber: position.line + 1, column: position.character + 1 };
}

export function toPosition(position: Position): types.Position {
    return new types.Position(position.lineNumber - 1, position.column - 1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDecorationOptions(something: any): something is theia.DecorationOptions {
    return (typeof something.range !== 'undefined');
}

export function isDecorationOptionsArr(something: theia.Range[] | theia.DecorationOptions[]): something is theia.DecorationOptions[] {
    if (something.length === 0) {
        return true;
    }
    return isDecorationOptions(something[0]) ? true : false;
}

export function fromRangeOrRangeWithMessage(ranges: theia.Range[] | theia.DecorationOptions[]): DecorationOptions[] {

    if (isDecorationOptionsArr(ranges)) {
        return ranges.map(r => {
            let hoverMessage;
            if (Array.isArray(r.hoverMessage)) {
                hoverMessage = fromManyMarkdown(r.hoverMessage);
            } else if (r.hoverMessage) {
                hoverMessage = fromMarkdown(r.hoverMessage);
            } else {
                hoverMessage = undefined;
            }
            return {
                range: fromRange(r.range)!,
                hoverMessage: hoverMessage,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                renderOptions: <any> /* URI vs Uri */r.renderOptions
            };
        });
    } else {
        return ranges.map(r => ({ range: fromRange(r) }));
    }
}

export function fromManyMarkdown(markup: (theia.MarkdownString | theia.MarkedString)[]): model.MarkdownString[] {
    return markup.map(fromMarkdown);
}

interface Codeblock {
    language: string;
    value: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isCodeblock(thing: any): thing is Codeblock {
    return thing && typeof thing === 'object'
        && typeof (<Codeblock>thing).language === 'string'
        && typeof (<Codeblock>thing).value === 'string';
}

export function fromMarkdown(markup: theia.MarkdownString | theia.MarkedString): model.MarkdownString {
    if (isCodeblock(markup)) {
        const { language, value } = markup;
        return { value: '```' + language + '\n' + value + '\n```\n' };
    } else if (isMarkdownString(markup)) {
        return markup;
    } else if (typeof markup === 'string') {
        return { value: <string>markup };
    } else {
        return { value: '' };
    }
}

export function toMarkdown(value: model.MarkdownString): MarkdownString {
    const ret = new MarkdownString(value.value);
    ret.isTrusted = value.isTrusted;
    return ret;
}

export function fromDocumentSelector(selector: theia.DocumentSelector | undefined): LanguageSelector | undefined {
    if (!selector) {
        return undefined;
    } else if (isReadonlyArray(selector)) {
        return <LanguageSelector>selector.map(fromDocumentSelector);
    } else if (typeof selector === 'string') {
        return selector;
    } else {
        return {
            language: selector.language,
            scheme: selector.scheme,
            pattern: fromGlobPattern(selector.pattern!)
        } as LanguageFilter;
    }

}

export function fromGlobPattern(pattern: theia.GlobPattern): string | RelativePattern {
    if (typeof pattern === 'string') {
        return pattern;
    }

    if (isRelativePattern(pattern)) {
        return new types.RelativePattern(pattern.base, pattern.pattern);
    }

    return pattern;
}

function isRelativePattern(obj: {}): obj is theia.RelativePattern {
    const rp = obj as theia.RelativePattern;
    return rp && typeof rp.base === 'string' && typeof rp.pattern === 'string';
}

export function fromCompletionItemKind(kind?: types.CompletionItemKind): model.CompletionItemKind {
    switch (kind) {
        case types.CompletionItemKind.Method: return model.CompletionItemKind.Method;
        case types.CompletionItemKind.Function: return model.CompletionItemKind.Function;
        case types.CompletionItemKind.Constructor: return model.CompletionItemKind.Constructor;
        case types.CompletionItemKind.Field: return model.CompletionItemKind.Field;
        case types.CompletionItemKind.Variable: return model.CompletionItemKind.Variable;
        case types.CompletionItemKind.Class: return model.CompletionItemKind.Class;
        case types.CompletionItemKind.Interface: return model.CompletionItemKind.Interface;
        case types.CompletionItemKind.Struct: return model.CompletionItemKind.Struct;
        case types.CompletionItemKind.Module: return model.CompletionItemKind.Module;
        case types.CompletionItemKind.Property: return model.CompletionItemKind.Property;
        case types.CompletionItemKind.Unit: return model.CompletionItemKind.Unit;
        case types.CompletionItemKind.Value: return model.CompletionItemKind.Value;
        case types.CompletionItemKind.Constant: return model.CompletionItemKind.Constant;
        case types.CompletionItemKind.Enum: return model.CompletionItemKind.Enum;
        case types.CompletionItemKind.EnumMember: return model.CompletionItemKind.EnumMember;
        case types.CompletionItemKind.Keyword: return model.CompletionItemKind.Keyword;
        case types.CompletionItemKind.Snippet: return model.CompletionItemKind.Snippet;
        case types.CompletionItemKind.Text: return model.CompletionItemKind.Text;
        case types.CompletionItemKind.Color: return model.CompletionItemKind.Color;
        case types.CompletionItemKind.File: return model.CompletionItemKind.File;
        case types.CompletionItemKind.Reference: return model.CompletionItemKind.Reference;
        case types.CompletionItemKind.Folder: return model.CompletionItemKind.Folder;
        case types.CompletionItemKind.Event: return model.CompletionItemKind.Event;
        case types.CompletionItemKind.Operator: return model.CompletionItemKind.Operator;
        case types.CompletionItemKind.TypeParameter: return model.CompletionItemKind.TypeParameter;
        case types.CompletionItemKind.User: return model.CompletionItemKind.User;
        case types.CompletionItemKind.Issue: return model.CompletionItemKind.Issue;
    }
    return model.CompletionItemKind.Property;
}

export function toCompletionItemKind(kind?: model.CompletionItemKind): types.CompletionItemKind {
    switch (kind) {
        case model.CompletionItemKind.Method: return types.CompletionItemKind.Method;
        case model.CompletionItemKind.Function: return types.CompletionItemKind.Function;
        case model.CompletionItemKind.Constructor: return types.CompletionItemKind.Constructor;
        case model.CompletionItemKind.Field: return types.CompletionItemKind.Field;
        case model.CompletionItemKind.Variable: return types.CompletionItemKind.Variable;
        case model.CompletionItemKind.Class: return types.CompletionItemKind.Class;
        case model.CompletionItemKind.Interface: return types.CompletionItemKind.Interface;
        case model.CompletionItemKind.Struct: return types.CompletionItemKind.Struct;
        case model.CompletionItemKind.Module: return types.CompletionItemKind.Module;
        case model.CompletionItemKind.Property: return types.CompletionItemKind.Property;
        case model.CompletionItemKind.Unit: return types.CompletionItemKind.Unit;
        case model.CompletionItemKind.Value: return types.CompletionItemKind.Value;
        case model.CompletionItemKind.Constant: return types.CompletionItemKind.Constant;
        case model.CompletionItemKind.Enum: return types.CompletionItemKind.Enum;
        case model.CompletionItemKind.EnumMember: return types.CompletionItemKind.EnumMember;
        case model.CompletionItemKind.Keyword: return types.CompletionItemKind.Keyword;
        case model.CompletionItemKind.Snippet: return types.CompletionItemKind.Snippet;
        case model.CompletionItemKind.Text: return types.CompletionItemKind.Text;
        case model.CompletionItemKind.Color: return types.CompletionItemKind.Color;
        case model.CompletionItemKind.File: return types.CompletionItemKind.File;
        case model.CompletionItemKind.Reference: return types.CompletionItemKind.Reference;
        case model.CompletionItemKind.Folder: return types.CompletionItemKind.Folder;
        case model.CompletionItemKind.Event: return types.CompletionItemKind.Event;
        case model.CompletionItemKind.Operator: return types.CompletionItemKind.Operator;
        case model.CompletionItemKind.TypeParameter: return types.CompletionItemKind.TypeParameter;
        case model.CompletionItemKind.User: return types.CompletionItemKind.User;
        case model.CompletionItemKind.Issue: return types.CompletionItemKind.Issue;
    }
    return types.CompletionItemKind.Property;
}

export function fromTextEdit(edit: theia.TextEdit): model.TextEdit {
    return {
        text: edit.newText,
        range: fromRange(edit.range)
    };
}

export function convertDiagnosticToMarkerData(diagnostic: theia.Diagnostic): model.MarkerData {
    return {
        code: convertCode(diagnostic.code),
        severity: convertSeverity(diagnostic.severity),
        message: diagnostic.message,
        source: diagnostic.source,
        startLineNumber: diagnostic.range.start.line + 1,
        startColumn: diagnostic.range.start.character + 1,
        endLineNumber: diagnostic.range.end.line + 1,
        endColumn: diagnostic.range.end.character + 1,
        relatedInformation: convertRelatedInformation(diagnostic.relatedInformation),
        tags: convertTags(diagnostic.tags)
    };
}

function convertCode(code: string | number | undefined): string | undefined {
    if (typeof code === 'number') {
        return String(code);
    } else {
        return code;
    }
}

function convertSeverity(severity: types.DiagnosticSeverity): types.MarkerSeverity {
    switch (severity) {
        case types.DiagnosticSeverity.Error: return types.MarkerSeverity.Error;
        case types.DiagnosticSeverity.Warning: return types.MarkerSeverity.Warning;
        case types.DiagnosticSeverity.Information: return types.MarkerSeverity.Info;
        case types.DiagnosticSeverity.Hint: return types.MarkerSeverity.Hint;
    }
}

function convertRelatedInformation(diagnosticsRelatedInformation: theia.DiagnosticRelatedInformation[] | undefined): model.RelatedInformation[] | undefined {
    if (!diagnosticsRelatedInformation) {
        return undefined;
    }

    const relatedInformation: model.RelatedInformation[] = [];
    for (const item of diagnosticsRelatedInformation) {
        relatedInformation.push({
            resource: item.location.uri.toString(),
            message: item.message,
            startLineNumber: item.location.range.start.line + 1,
            startColumn: item.location.range.start.character + 1,
            endLineNumber: item.location.range.end.line + 1,
            endColumn: item.location.range.end.character + 1
        });
    }
    return relatedInformation;
}

function convertTags(tags: types.DiagnosticTag[] | undefined): types.MarkerTag[] | undefined {
    if (!tags) {
        return undefined;
    }

    const markerTags: types.MarkerTag[] = [];
    for (const tag of tags) {
        switch (tag) {
            case types.DiagnosticTag.Unnecessary:
                markerTags.push(types.MarkerTag.Unnecessary);
                break;
            case types.DiagnosticTag.Deprecated:
                markerTags.push(types.MarkerTag.Deprecated);
                break;
        }
    }
    return markerTags;
}

export function fromHover(hover: theia.Hover): model.Hover {
    return <model.Hover>{
        range: fromRange(hover.range),
        contents: fromManyMarkdown(hover.contents)
    };
}

export function fromLocation(location: theia.Location): model.Location {
    return <model.Location>{
        uri: location.uri,
        range: fromRange(location.range)
    };
}

export function fromTextDocumentShowOptions(options: theia.TextDocumentShowOptions): model.TextDocumentShowOptions {
    if (options.selection) {
        return {
            ...options,
            selection: fromRange(options.selection),
        };
    }
    return options as model.TextDocumentShowOptions;
}

export function fromDefinitionLink(definitionLink: theia.DefinitionLink): model.LocationLink {
    return <model.LocationLink>{
        uri: definitionLink.targetUri,
        range: fromRange(definitionLink.targetRange),
        originSelectionRange: definitionLink.originSelectionRange ? fromRange(definitionLink.originSelectionRange) : undefined,
        targetSelectionRange: definitionLink.targetSelectionRange ? fromRange(definitionLink.targetSelectionRange) : undefined
    };
}

export namespace DocumentLink {

    export function from(link: theia.DocumentLink): model.DocumentLink {
        return {
            range: fromRange(link.range),
            url: link.target,
            tooltip: link.tooltip
        };
    }

    export function to(link: model.DocumentLink): theia.DocumentLink {
        let target: URI | undefined = undefined;
        if (link.url) {
            try {
                target = typeof link.url === 'string' ? URI.parse(link.url, true) : URI.revive(link.url);
            } catch (err) {
                // ignore
            }
        }
        return new types.DocumentLink(toRange(link.range), target);
    }
}

export function fromDocumentHighlightKind(kind?: theia.DocumentHighlightKind): model.DocumentHighlightKind | undefined {
    switch (kind) {
        case types.DocumentHighlightKind.Text: return model.DocumentHighlightKind.Text;
        case types.DocumentHighlightKind.Read: return model.DocumentHighlightKind.Read;
        case types.DocumentHighlightKind.Write: return model.DocumentHighlightKind.Write;
    }
    return model.DocumentHighlightKind.Text;
}

export function fromDocumentHighlight(documentHighlight: theia.DocumentHighlight): model.DocumentHighlight {
    return <model.DocumentHighlight>{
        range: fromRange(documentHighlight.range),
        kind: fromDocumentHighlightKind(documentHighlight.kind)
    };
}

export namespace ParameterInformation {
    export function from(info: types.ParameterInformation): model.ParameterInformation {
        return {
            label: info.label,
            documentation: info.documentation ? fromMarkdown(info.documentation) : undefined
        };
    }
    export function to(info: model.ParameterInformation): types.ParameterInformation {
        return {
            label: info.label,
            documentation: isMarkdownString(info.documentation) ? toMarkdown(info.documentation) : info.documentation
        };
    }
}

export namespace SignatureInformation {

    export function from(info: types.SignatureInformation): model.SignatureInformation {
        return {
            label: info.label,
            documentation: info.documentation ? fromMarkdown(info.documentation) : undefined,
            parameters: info.parameters && info.parameters.map(ParameterInformation.from)
        };
    }

    export function to(info: model.SignatureInformation): types.SignatureInformation {
        return {
            label: info.label,
            documentation: isMarkdownString(info.documentation) ? toMarkdown(info.documentation) : info.documentation,
            parameters: info.parameters && info.parameters.map(ParameterInformation.to)
        };
    }
}

export namespace SignatureHelp {

    export function from(id: number, help: types.SignatureHelp): model.SignatureHelp {
        return {
            id,
            activeSignature: help.activeSignature,
            activeParameter: help.activeParameter,
            signatures: help.signatures && help.signatures.map(SignatureInformation.from)
        };
    }

    export function to(help: model.SignatureHelp): types.SignatureHelp {
        return {
            activeSignature: help.activeSignature,
            activeParameter: help.activeParameter,
            signatures: help.signatures && help.signatures.map(SignatureInformation.to)
        };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromWorkspaceEdit(value: theia.WorkspaceEdit, documents?: any): WorkspaceEditDto {
    const result: WorkspaceEditDto = {
        edits: []
    };
    for (const entry of (value as types.WorkspaceEdit)._allEntries()) {
        const [uri, uriOrEdits] = entry;
        if (Array.isArray(uriOrEdits)) {
            // text edits
            const doc = documents ? documents.getDocument(uri.toString()) : undefined;
            result.edits.push(<WorkspaceTextEditDto>{ resource: uri, modelVersionId: doc && doc.version, edit: uriOrEdits.map(fromTextEdit)[0], metadata: entry[2] });
        } else {
            // resource edits
            result.edits.push(<WorkspaceFileEditDto>{ oldUri: uri, newUri: uriOrEdits, options: entry[2], metadata: entry[3] });
        }
    }
    return result;
}

export namespace SymbolKind {
    const fromMapping: { [kind: number]: model.SymbolKind } = Object.create(null);
    fromMapping[model.SymbolKind.File] = model.SymbolKind.File;
    fromMapping[model.SymbolKind.Module] = model.SymbolKind.Module;
    fromMapping[model.SymbolKind.Namespace] = model.SymbolKind.Namespace;
    fromMapping[model.SymbolKind.Package] = model.SymbolKind.Package;
    fromMapping[model.SymbolKind.Class] = model.SymbolKind.Class;
    fromMapping[model.SymbolKind.Method] = model.SymbolKind.Method;
    fromMapping[model.SymbolKind.Property] = model.SymbolKind.Property;
    fromMapping[model.SymbolKind.Field] = model.SymbolKind.Field;
    fromMapping[model.SymbolKind.Constructor] = model.SymbolKind.Constructor;
    fromMapping[model.SymbolKind.Enum] = model.SymbolKind.Enum;
    fromMapping[model.SymbolKind.Interface] = model.SymbolKind.Interface;
    fromMapping[model.SymbolKind.Function] = model.SymbolKind.Function;
    fromMapping[model.SymbolKind.Variable] = model.SymbolKind.Variable;
    fromMapping[model.SymbolKind.Constant] = model.SymbolKind.Constant;
    fromMapping[model.SymbolKind.String] = model.SymbolKind.String;
    fromMapping[model.SymbolKind.Number] = model.SymbolKind.Number;
    fromMapping[model.SymbolKind.Boolean] = model.SymbolKind.Boolean;
    fromMapping[model.SymbolKind.Array] = model.SymbolKind.Array;
    fromMapping[model.SymbolKind.Object] = model.SymbolKind.Object;
    fromMapping[model.SymbolKind.Key] = model.SymbolKind.Key;
    fromMapping[model.SymbolKind.Null] = model.SymbolKind.Null;
    fromMapping[model.SymbolKind.EnumMember] = model.SymbolKind.EnumMember;
    fromMapping[model.SymbolKind.Struct] = model.SymbolKind.Struct;
    fromMapping[model.SymbolKind.Event] = model.SymbolKind.Event;
    fromMapping[model.SymbolKind.Operator] = model.SymbolKind.Operator;
    fromMapping[model.SymbolKind.TypeParameter] = model.SymbolKind.TypeParameter;

    export function fromSymbolKind(kind: theia.SymbolKind): model.SymbolKind {
        return fromMapping[kind] || model.SymbolKind.Property;
    }

    export function toSymbolKind(kind: model.SymbolKind): theia.SymbolKind {
        for (const k in fromMapping) {
            if (fromMapping[k] === kind) {
                return Number(k);
            }
        }
        return model.SymbolKind.Property;
    }
}

export function fromDocumentSymbol(info: theia.DocumentSymbol): model.DocumentSymbol {
    const result: model.DocumentSymbol = {
        name: info.name,
        detail: info.detail,
        range: fromRange(info.range)!,
        tags: info.tags ? info.tags.map(fromSymbolTag) : [],
        selectionRange: fromRange(info.selectionRange)!,
        kind: SymbolKind.fromSymbolKind(info.kind)
    };
    if (info.children) {
        result.children = info.children.map(fromDocumentSymbol);
    }
    return result;
}

export function toDocumentSymbol(symbol: model.DocumentSymbol): theia.DocumentSymbol {
    return {
        name: symbol.name,
        detail: symbol.detail,
        range: toRange(symbol.range)!,
        tags: symbol.tags && symbol.tags.length > 0 ? symbol.tags.map(toSymbolTag) : [],
        selectionRange: toRange(symbol.selectionRange)!,
        children: symbol.children ? symbol.children.map(toDocumentSymbol) : [],
        kind: SymbolKind.toSymbolKind(symbol.kind)
    };
}

export function fromSymbolTag(kind: types.SymbolTag): model.SymbolTag {
    switch (kind) {
        case types.SymbolTag.Deprecated: return model.SymbolTag.Deprecated;
    }
}

export function toSymbolTag(kind: model.SymbolTag): types.SymbolTag {
    switch (kind) {
        case model.SymbolTag.Deprecated: return types.SymbolTag.Deprecated;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isModelLocation(thing: any): thing is model.Location {
    if (!thing) {
        return false;
    }
    return isModelRange((<model.Location>thing).range) &&
        isUriComponents((<model.Location>thing).uri);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isModelRange(thing: any): thing is model.Range {
    if (!thing) {
        return false;
    }
    return (('startLineNumber' in thing) && typeof thing.startLineNumber === 'number') &&
        (('startColumn' in thing) && typeof thing.startColumn === 'number') &&
        (('endLineNumber' in thing) && typeof thing.endLineNumber === 'number') &&
        (('endColumn' in thing) && typeof thing.endColumn === 'number');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isUriComponents(thing: any): thing is UriComponents {
    if (!thing) {
        return false;
    }
    return (('scheme' in thing) && typeof thing.scheme === 'string') &&
        (('path' in thing) && typeof thing.path === 'string') &&
        (('query' in thing) && typeof thing.query === 'string') &&
        (('fragment' in thing) && typeof thing.fragment === 'string');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isModelCallHierarchyItem(thing: any): thing is model.CallHierarchyItem {
    if (!thing) {
        return false;
    }
    return isModelRange(thing.range)
        && isModelRange(thing.selectionRange)
        && isUriComponents(thing.uri)
        && !!thing.name;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isModelCallHierarchyIncomingCall(thing: any): thing is model.CallHierarchyIncomingCall {
    if (!thing) {
        return false;
    }
    const maybeIncomingCall = thing as model.CallHierarchyIncomingCall;
    return 'from' in maybeIncomingCall && 'fromRanges' in maybeIncomingCall && isModelCallHierarchyItem(maybeIncomingCall.from);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isModelCallHierarchyOutgoingCall(thing: any): thing is model.CallHierarchyOutgoingCall {
    if (!thing) {
        return false;
    }
    const maybeOutgoingCall = thing as model.CallHierarchyOutgoingCall;
    return 'to' in maybeOutgoingCall && 'fromRanges' in maybeOutgoingCall && isModelCallHierarchyItem(maybeOutgoingCall.to);
}

export function toLocation(value: model.Location): types.Location {
    return new types.Location(URI.revive(value.uri), toRange(value.range));
}

export function fromCallHierarchyItem(item: theia.CallHierarchyItem): model.CallHierarchyItem {
    return <model.CallHierarchyItem>{
        kind: SymbolKind.fromSymbolKind(item.kind),
        name: item.name,
        detail: item.detail,
        uri: item.uri,
        range: fromRange(item.range),
        selectionRange: fromRange(item.selectionRange),
        tags: item.tags,
        data: item.data,
    };
}

export function toCallHierarchyItem(value: model.CallHierarchyItem): types.CallHierarchyItem {
    const item = new types.CallHierarchyItem(
        SymbolKind.toSymbolKind(value.kind),
        value.name,
        value.detail ? value.detail : '',
        URI.revive(value.uri),
        toRange(value.range),
        toRange(value.selectionRange),
    );
    item.tags = value.tags;
    item.data = value.data;
    return item;
}

export function toCallHierarchyIncomingCall(value: model.CallHierarchyIncomingCall): types.CallHierarchyIncomingCall {
    return new types.CallHierarchyIncomingCall(
        toCallHierarchyItem(value.from),
        value.fromRanges && value.fromRanges.map(toRange));
}

export function toCallHierarchyOutgoingCall(value: model.CallHierarchyOutgoingCall): types.CallHierarchyOutgoingCall {
    return new types.CallHierarchyOutgoingCall(
        toCallHierarchyItem(value.to),
        value.fromRanges && value.fromRanges.map(toRange));
}

export function toWorkspaceFolder(folder: model.WorkspaceFolder): theia.WorkspaceFolder {
    return {
        uri: URI.revive(folder.uri),
        name: folder.name,
        index: folder.index
    };
}

export function fromTask(task: theia.Task): TaskDto | undefined {
    if (!task) {
        return undefined;
    }

    const taskDto = {} as TaskDto;
    taskDto.label = task.name;
    taskDto.source = task.source;

    if ((task as types.Task).hasProblemMatchers) {
        taskDto.problemMatcher = task.problemMatchers;
    }
    if ('detail' in task) {
        taskDto.detail = task.detail;
    }
    if (typeof task.scope === 'object') {
        taskDto.scope = task.scope.uri.toString();
    } else if (typeof task.scope === 'number') {
        taskDto.scope = task.scope;
    }

    if (task.presentationOptions) {
        taskDto.presentation = task.presentationOptions;
    }

    const group = task.group;
    if (group === types.TaskGroup.Build) {
        taskDto.group = BUILD_GROUP;
    } else if (group === types.TaskGroup.Test) {
        taskDto.group = TEST_GROUP;
    }

    const taskDefinition = task.definition;
    if (!taskDefinition) {
        return taskDto;
    }

    taskDto.type = taskDefinition.type;
    const { type, ...properties } = taskDefinition;
    for (const key in properties) {
        if (properties.hasOwnProperty(key)) {
            taskDto[key] = properties[key];
        }
    }

    const execution = task.execution;
    if (!execution) {
        return taskDto;
    }

    if (types.ShellExecution.is(execution)) {
        return fromShellExecution(execution, taskDto);
    }

    if (types.ProcessExecution.is(execution)) {
        return fromProcessExecution(execution, taskDto);
    }

    if (types.CustomExecution.is(execution)) {
        return fromCustomExecution(execution, taskDto);
    }

    return taskDto;
}

export function toTask(taskDto: TaskDto): theia.Task {
    if (!taskDto) {
        throw new Error('Task should be provided for converting');
    }

    const { type, taskType, label, source, scope, problemMatcher, detail, command, args, options, group, presentation, ...properties } = taskDto;
    const result = {} as theia.Task;
    result.name = label;
    result.source = source;
    if (detail) {
        result.detail = detail;
    }
    if (typeof scope === 'string') {
        const uri = URI.parse(scope);
        result.scope = {
            uri,
            name: uri.toString(),
            index: 0
        };
    } else {
        result.scope = scope;
    }

    const taskDefinition: theia.TaskDefinition = {
        type: type
    };

    result.definition = taskDefinition;

    if (taskType === 'process') {
        result.execution = getProcessExecution(taskDto);
    }

    const execution = { command, args, options };
    if (taskType === 'shell' || types.ShellExecution.is(execution)) {
        result.execution = getShellExecution(taskDto);
    }

    if (taskType === 'customExecution' || types.CustomExecution.is(execution)) {
        result.execution = getCustomExecution(taskDto);
        // if taskType is customExecution, we need to put all the information into taskDefinition,
        // because some parameters may be in taskDefinition.
        taskDefinition.label = label;
        taskDefinition.command = command;
        taskDefinition.args = args;
        taskDefinition.options = options;
    }

    if (group) {
        if (group === BUILD_GROUP) {
            result.group = types.TaskGroup.Build;
        } else if (group === TEST_GROUP) {
            result.group = types.TaskGroup.Test;
        }
    }

    if (presentation) {
        result.presentationOptions = presentation;
    }

    if (!properties) {
        return result;
    }

    for (const key in properties) {
        if (properties.hasOwnProperty(key)) {
            taskDefinition[key] = properties[key];
        }
    }

    return result;
}

export function fromProcessExecution(execution: theia.ProcessExecution, taskDto: TaskDto): TaskDto {
    taskDto.taskType = 'process';
    taskDto.command = execution.process;
    taskDto.args = execution.args;

    const options = execution.options;
    if (options) {
        taskDto.options = options;
    }
    return taskDto;
}

export function fromShellExecution(execution: theia.ShellExecution, taskDto: TaskDto): TaskDto {
    taskDto.taskType = 'shell';
    const options = execution.options;
    if (options) {
        taskDto.options = getShellExecutionOptions(options);
    }

    const commandLine = execution.commandLine;
    if (commandLine) {
        taskDto.command = commandLine;
        return taskDto;
    }

    const command = execution.command;
    if (typeof command === 'string') {
        taskDto.command = command;
        taskDto.args = getShellArgs(execution.args);
        return taskDto;
    } else {
        throw new Error('Converting ShellQuotedString command is not implemented');
    }
}

export function fromCustomExecution(execution: theia.CustomExecution, taskDto: TaskDto): TaskDto {
    taskDto.taskType = 'customExecution';
    const callback = execution.callback;
    if (callback) {
        taskDto.callback = callback;
        return taskDto;
    } else {
        throw new Error('Converting CustomExecution callback is not implemented');
    }
}

export function getProcessExecution(taskDto: TaskDto): theia.ProcessExecution {
    return new types.ProcessExecution(
        taskDto.command,
        taskDto.args || [],
        taskDto.options || {});
}

export function getShellExecution(taskDto: TaskDto): theia.ShellExecution {
    if (taskDto.command && Array.isArray(taskDto.args) && taskDto.args.length !== 0) {
        return new types.ShellExecution(
            taskDto.command,
            taskDto.args,
            taskDto.options || {});
    }
    return new types.ShellExecution(
        taskDto.command || taskDto.commandLine,
        taskDto.options || {});
}

export function getCustomExecution(taskDto: TaskDto): theia.CustomExecution {
    return new types.CustomExecution(taskDto.callback);
}

export function getShellArgs(args: undefined | (string | theia.ShellQuotedString)[]): string[] {
    if (!args || args.length === 0) {
        return [];
    }

    const element = args[0];
    if (typeof element === 'string') {
        return args as string[];
    }

    const result: string[] = [];
    const shellQuotedArgs = args as theia.ShellQuotedString[];

    shellQuotedArgs.forEach(arg => {
        result.push(arg.value);
    });

    return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getShellExecutionOptions(options: theia.ShellExecutionOptions): { [key: string]: any } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = {} as { [key: string]: any };

    const env = options.env;
    if (env) {
        result['env'] = env;
    }

    const executable = options.executable;
    if (executable) {
        result['executable'] = executable;
    }

    const shellQuoting = options.shellQuoting;
    if (shellQuoting) {
        result['shellQuoting'] = shellQuoting;
    }

    const shellArgs = options.shellArgs;
    if (shellArgs) {
        result['shellArgs'] = shellArgs;
    }

    const cwd = options.cwd;
    if (cwd) {
        Object.assign(result, { cwd });
    }

    return result;
}

export function fromSymbolInformation(symbolInformation: theia.SymbolInformation): lstypes.SymbolInformation | undefined {
    if (!symbolInformation) {
        return undefined;
    }

    if (symbolInformation.location && symbolInformation.location.range) {
        const p1 = lstypes.Position.create(symbolInformation.location.range.start.line, symbolInformation.location.range.start.character);
        const p2 = lstypes.Position.create(symbolInformation.location.range.end.line, symbolInformation.location.range.end.character);
        return lstypes.SymbolInformation.create(symbolInformation.name, symbolInformation.kind++ as lstypes.SymbolKind, lstypes.Range.create(p1, p2),
            symbolInformation.location.uri.toString(), symbolInformation.containerName);
    }

    return {
        name: symbolInformation.name,
        containerName: symbolInformation.containerName,
        kind: symbolInformation.kind++ as lstypes.SymbolKind,
        location: {
            uri: symbolInformation.location.uri.toString(),
            range: symbolInformation.location.range,
        }
    };
}

export function toSymbolInformation(symbolInformation: lstypes.SymbolInformation): theia.SymbolInformation | undefined {
    if (!symbolInformation) {
        return undefined;
    }

    return <theia.SymbolInformation>{
        name: symbolInformation.name,
        containerName: symbolInformation.containerName,
        kind: symbolInformation.kind,
        location: {
            uri: URI.parse(symbolInformation.location.uri),
            range: symbolInformation.location.range
        }
    };
}

export function fromSelectionRange(selectionRange: theia.SelectionRange): model.SelectionRange {
    return { range: fromRange(selectionRange.range) };
}

export function fromFoldingRange(foldingRange: theia.FoldingRange): model.FoldingRange {
    const range: model.FoldingRange = {
        start: foldingRange.start + 1,
        end: foldingRange.end + 1
    };
    if (foldingRange.kind) {
        range.kind = fromFoldingRangeKind(foldingRange.kind);
    }
    return range;
}

export function fromFoldingRangeKind(kind: theia.FoldingRangeKind | undefined): model.FoldingRangeKind | undefined {
    if (kind) {
        switch (kind) {
            case types.FoldingRangeKind.Comment:
                return model.FoldingRangeKind.Comment;
            case types.FoldingRangeKind.Imports:
                return model.FoldingRangeKind.Imports;
            case types.FoldingRangeKind.Region:
                return model.FoldingRangeKind.Region;
        }
    }
    return undefined;
}

export function fromColor(color: types.Color): [number, number, number, number] {
    return [color.red, color.green, color.blue, color.alpha];
}

export function toColor(color: [number, number, number, number]): types.Color {
    return new types.Color(color[0], color[1], color[2], color[3]);
}

export function fromColorPresentation(colorPresentation: theia.ColorPresentation): model.ColorPresentation {
    return {
        label: colorPresentation.label,
        textEdit: colorPresentation.textEdit ? fromTextEdit(colorPresentation.textEdit) : undefined,
        additionalTextEdits: colorPresentation.additionalTextEdits ? colorPresentation.additionalTextEdits.map(value => fromTextEdit(value)) : undefined
    };
}

export function convertToTransferQuickPickItems(items: rpc.Item[]): rpc.TransferQuickPickItems[] {
    return items.map<rpc.TransferQuickPickItems>((item, index) => {
        if (typeof item === 'string') {
            return { type: 'item', label: item, handle: index };
        } else if (item.type === 'separator') {
            return { ...item, handle: index };
        } else {
            const { label, description, detail, picked, alwaysShow } = item;
            return {
                type: 'item',
                label,
                description,
                detail,
                picked,
                alwaysShow,
                handle: index,
            };
        }
    });
}

export namespace DecorationRenderOptions {
    export function from(options: theia.DecorationRenderOptions): rpc.DecorationRenderOptions {
        return {
            isWholeLine: options.isWholeLine,
            rangeBehavior: options.rangeBehavior ? DecorationRangeBehavior.from(options.rangeBehavior) : undefined,
            overviewRulerLane: options.overviewRulerLane,
            light: options.light ? ThemableDecorationRenderOptions.from(options.light) : undefined,
            dark: options.dark ? ThemableDecorationRenderOptions.from(options.dark) : undefined,

            backgroundColor: <string | types.ThemeColor>options.backgroundColor,
            outline: options.outline,
            outlineColor: <string | types.ThemeColor>options.outlineColor,
            outlineStyle: options.outlineStyle,
            outlineWidth: options.outlineWidth,
            border: options.border,
            borderColor: <string | types.ThemeColor>options.borderColor,
            borderRadius: options.borderRadius,
            borderSpacing: options.borderSpacing,
            borderStyle: options.borderStyle,
            borderWidth: options.borderWidth,
            fontStyle: options.fontStyle,
            fontWeight: options.fontWeight,
            textDecoration: options.textDecoration,
            cursor: options.cursor,
            color: <string | types.ThemeColor>options.color,
            opacity: options.opacity,
            letterSpacing: options.letterSpacing,
            gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : undefined,
            gutterIconSize: options.gutterIconSize,
            overviewRulerColor: <string | types.ThemeColor>options.overviewRulerColor,
            before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : undefined,
            after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : undefined,
        };
    }
}

export namespace DecorationRangeBehavior {
    export function from(value: types.DecorationRangeBehavior): rpc.TrackedRangeStickiness {
        if (typeof value === 'undefined') {
            return value;
        }
        switch (value) {
            case types.DecorationRangeBehavior.OpenOpen:
                return rpc.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
            case types.DecorationRangeBehavior.ClosedClosed:
                return rpc.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
            case types.DecorationRangeBehavior.OpenClosed:
                return rpc.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
            case types.DecorationRangeBehavior.ClosedOpen:
                return rpc.TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
        }
    }
}

export namespace ThemableDecorationRenderOptions {
    export function from(options: theia.ThemableDecorationRenderOptions): rpc.ThemeDecorationRenderOptions {
        if (typeof options === 'undefined') {
            return options;
        }
        return {
            backgroundColor: <string | types.ThemeColor>options.backgroundColor,
            outline: options.outline,
            outlineColor: <string | types.ThemeColor>options.outlineColor,
            outlineStyle: options.outlineStyle,
            outlineWidth: options.outlineWidth,
            border: options.border,
            borderColor: <string | types.ThemeColor>options.borderColor,
            borderRadius: options.borderRadius,
            borderSpacing: options.borderSpacing,
            borderStyle: options.borderStyle,
            borderWidth: options.borderWidth,
            fontStyle: options.fontStyle,
            fontWeight: options.fontWeight,
            textDecoration: options.textDecoration,
            cursor: options.cursor,
            color: <string | types.ThemeColor>options.color,
            opacity: options.opacity,
            letterSpacing: options.letterSpacing,
            gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : undefined,
            gutterIconSize: options.gutterIconSize,
            overviewRulerColor: <string | types.ThemeColor>options.overviewRulerColor,
            before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : undefined,
            after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : undefined,
        };
    }
}

export namespace ThemableDecorationAttachmentRenderOptions {
    export function from(options: theia.ThemableDecorationAttachmentRenderOptions): rpc.ContentDecorationRenderOptions {
        if (typeof options === 'undefined') {
            return options;
        }
        return {
            contentText: options.contentText,
            contentIconPath: options.contentIconPath ? pathOrURIToURI(options.contentIconPath) : undefined,
            border: options.border,
            borderColor: <string | types.ThemeColor>options.borderColor,
            fontStyle: options.fontStyle,
            fontWeight: options.fontWeight,
            textDecoration: options.textDecoration,
            color: <string | types.ThemeColor>options.color,
            backgroundColor: <string | types.ThemeColor>options.backgroundColor,
            margin: options.margin,
            width: options.width,
            height: options.height,
        };
    }
}

export function pathOrURIToURI(value: string | URI): URI {
    if (typeof value === 'undefined') {
        return value;
    }
    if (typeof value === 'string') {
        return URI.file(value);
    } else {
        return value;
    }
}

export function pluginToPluginInfo(plugin: Plugin): rpc.PluginInfo {
    return {
        id: plugin.model.id,
        name: plugin.model.name,
        displayName: plugin.model.displayName
    };
}
