extern crate swc_common;
extern crate swc_ecma_parser;
extern crate swc_ecma_visit;

use std::env;
use std::fmt::Display;
use std::path::Path;

use swc_common::sync::Lrc;
use swc_common::BytePos;
use swc_common::{
    errors::{ColorConfig, Handler},
    SourceMap,
};
use swc_ecma_parser::{lexer::Lexer, Parser, StringInput, Syntax};
use swc_ecma_visit::swc_ecma_ast::{
    CallExpr, Callee, Expr, ImportDecl, ImportSpecifier, Lit, ModuleExportName, Str,
};
use swc_ecma_visit::{VisitAll, VisitAllWith};

#[derive(Copy, Clone)]
enum Dep {
    Require(String),
    ImportDefault {
        from: String,
    },
    ImportName {
        from: String,
        local: String,
        remote: String,
    }, // local, imported
    ImportStar {
        from: String,
    },
}

struct Visitor {
    deps: Vec<Dep>,
    path: String, // full path relative to entrypoint
}

impl Visitor {
    fn new(path: String) -> Visitor {
        Visitor {
            deps: Vec::new(),
            path,
        }
    }

    fn visit(&mut self) {
        let cm: Lrc<SourceMap> = Default::default();
        let fm = cm.load_file(Path::new(&self.path)).expect("Couldn't open");
        let lexer = Lexer::new(
            Syntax::Es(Default::default()),
            Default::default(),
            StringInput::from(&*fm),
            None,
        );

        let mut parser = Parser::new_from(lexer);

        let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

        let module = parser
            .parse_module()
            .map_err(|e| e.into_diagnostic(&handler).emit())
            .expect("failed to parse module");

        module.visit_all_with(self)
    }
}

impl VisitAll for Visitor {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        let BytePos(byte_begin) = call.span.lo;
        let BytePos(byte_end) = call.span.hi;

        println!("Call expr {}, {}", byte_begin, byte_end);

        if let Callee::Expr(boxed) = &call.callee {
            let callee = &**boxed;

            if let Expr::Ident(ident) = callee {
                if ident.sym.to_string().eq("require") {
                    println!("It's a require!");

                    if call.args.len() == 1 {
                        if let Expr::Lit(Lit::Str(Str {
                            value: name,
                            span: _,
                            raw: _,
                        })) = &*call.args[0].expr
                        {
                            println!("Requiring {}", name)
                        }
                    }
                }
            }
        }
    }

    fn visit_import_decl(&mut self, decl: &ImportDecl) {
        let BytePos(byte_begin) = decl.span.lo;
        let BytePos(byte_end) = decl.span.hi;

        println!(
            "Importing from {} at {} - {}",
            decl.src.value.to_string(),
            byte_begin,
            byte_end
        );

        for spec in decl.specifiers.iter() {
            match spec {
                ImportSpecifier::Default(default) => {
                    println!("Default import as {}", default.local.sym)
                }
                ImportSpecifier::Named(named) => {
                    let remote_name = match &named.imported {
                        Some(ModuleExportName::Ident(ident)) => ident.sym.to_string(),
                        Some(ModuleExportName::Str(str)) => str.value.to_string(),
                        None => named.local.sym.to_string(),
                    };
                    println!("Sub-import {} as {}", remote_name, named.local.sym);
                }
                ImportSpecifier::Namespace(star) => {
                    println!("Star import")
                }
            }
        }

        println!("End import")
    }
}

fn main() {
    let entrypoint = env::args().nth(1).unwrap_or(String::from("./main.js"));

    let mut visitor = Visitor::new(entrypoint);
    visitor.visit()
}
