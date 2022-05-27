extern crate swc_common;
extern crate swc_ecma_parser;
extern crate swc_ecma_visit;

use std::env;
use std::fmt::{format, Display};
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

#[derive(Clone)]
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
    full_rel_path: String, // full path to visited file, relative to entrypoint
                           // dep_name: String,      // name or path used when importing/requiring in source code
}

impl Visitor {
    fn new(path: String) -> Visitor {
        Visitor {
            full_rel_path: path,
            // dep_name: String::from(""),
        }
    }

    fn visit(&mut self) {
        let cm: Lrc<SourceMap> = Default::default();
        let fm = cm
            .load_file(Path::new(&self.full_rel_path))
            .expect("Couldn't open");
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

    // get full_rel_path of another module imported/required from the current one.
    fn resolve_require(&mut self, dep_name: String) -> String {
        let curr_dir = Path::new(&self.full_rel_path).parent();

        fn load_as_file() {}

        if dep_name.starts_with("./") {
            let full_rel_path = Path::new(&self.full_rel_path).join(&dep_name).to_owned();

            if full_rel_path.is_dir() {
                println!("Importing directory: {}", full_rel_path.display());
            } else if full_rel_path.is_file() {
                println!("Importing file: {}", full_rel_path.display())
            } else {
                panic!("Couldn't read dep: {}", dep_name)
            }

            String::from(
                full_rel_path
                    .to_str()
                    .expect("Couldn't parse resolve path for "),
            )
        } else {
            panic!(
                "Including from node_modules is not yet supported. ({})",
                dep_name
            )
        }
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
                            println!("Requiring {}", name);

                            println!(
                                "Resolves to {}",
                                self.resolve_require(String::from(name.to_string()))
                            );
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
