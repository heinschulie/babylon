// Auto-generated. DO NOT EDIT.
// Run `npx convex dev` to regenerate.

import type {
	GenericQueryCtx,
	GenericMutationCtx,
	GenericActionCtx,
	RegisteredQuery,
	RegisteredMutation,
	RegisteredAction,
	FunctionReference
} from 'convex/server';
import type { DataModel } from './dataModel';

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;

export declare const query: <
	ArgsValidator extends object,
	ReturnsValidator extends object | void,
	Output
>(
	func:
		| {
				args?: ArgsValidator;
				returns?: ReturnsValidator;
				handler: (ctx: QueryCtx, args: any) => Output | Promise<Output>;
		  }
		| ((ctx: QueryCtx, args: any) => Output | Promise<Output>)
) => RegisteredQuery<'public', any, Output>;

export declare const internalQuery: <
	ArgsValidator extends object,
	ReturnsValidator extends object | void,
	Output
>(
	func:
		| {
				args?: ArgsValidator;
				returns?: ReturnsValidator;
				handler: (ctx: QueryCtx, args: any) => Output | Promise<Output>;
		  }
		| ((ctx: QueryCtx, args: any) => Output | Promise<Output>)
) => RegisteredQuery<'internal', any, Output>;

export declare const mutation: <
	ArgsValidator extends object,
	ReturnsValidator extends object | void,
	Output
>(
	func:
		| {
				args?: ArgsValidator;
				returns?: ReturnsValidator;
				handler: (ctx: MutationCtx, args: any) => Output | Promise<Output>;
		  }
		| ((ctx: MutationCtx, args: any) => Output | Promise<Output>)
) => RegisteredMutation<'public', any, Output>;

export declare const internalMutation: <
	ArgsValidator extends object,
	ReturnsValidator extends object | void,
	Output
>(
	func:
		| {
				args?: ArgsValidator;
				returns?: ReturnsValidator;
				handler: (ctx: MutationCtx, args: any) => Output | Promise<Output>;
		  }
		| ((ctx: MutationCtx, args: any) => Output | Promise<Output>)
) => RegisteredMutation<'internal', any, Output>;

export declare const action: <
	ArgsValidator extends object,
	ReturnsValidator extends object | void,
	Output
>(
	func:
		| {
				args?: ArgsValidator;
				returns?: ReturnsValidator;
				handler: (ctx: ActionCtx, args: any) => Output | Promise<Output>;
		  }
		| ((ctx: ActionCtx, args: any) => Output | Promise<Output>)
) => RegisteredAction<'public', any, Output>;

export declare const internalAction: <
	ArgsValidator extends object,
	ReturnsValidator extends object | void,
	Output
>(
	func:
		| {
				args?: ArgsValidator;
				returns?: ReturnsValidator;
				handler: (ctx: ActionCtx, args: any) => Output | Promise<Output>;
		  }
		| ((ctx: ActionCtx, args: any) => Output | Promise<Output>)
) => RegisteredAction<'internal', any, Output>;

export declare const httpAction: (
	func: (ctx: ActionCtx, request: Request) => Promise<Response>
) => any;
