#!/usr/bin/env node

/* eslint-disable no-console */
/* eslint-disable consistent-return */
/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-underscore-dangle */
// 最后可以将转化后的 AST 再使用 @babel/core 生成代码字符串

const fs = require("fs");
const path = require("path");
const astParser = require("@babel/parser");
const { spawn } = require('child_process');
const generate = require("@babel/generator").default;
const { parse } = require("@vue/compiler-sfc");
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function createG() {
  const args = process.argv.slice(2); // 获取命令行参数，忽略前两个参数（node 和脚本路径）
  console.log("您将要转化的参数：", args);
  if (!args[0]) {
    console.error("请提供目录名参数或文件名参数"); // 如果没有或者缺少文件名参数，则打印错误信息
    process.exit(1);
  }

  const vuexClassDecorator = [
    "Mutation",
    "State",
    "Action",
    "Getter",
  ];
  function readFilesFromRoot(rootPath) {
    const results = [];

    // 读取根目录下的所有文件和文件夹
    try {
      if (fs.statSync(rootPath).isDirectory()) {
        const items = fs.readdirSync(rootPath);
        // 遍历所有文件和文件夹
        for (const item of items) {
          const itemPath = path.join(rootPath, item);
          // 如果是文件夹，则递归读取子文件夹和文件
          if (fs.statSync(itemPath).isDirectory()) {
            const subResults = readFilesFromRoot(itemPath);
            results.push(...subResults);
          } else if ( // 如果是文件，则将文件路径添加到结果数组中
            path.extname(itemPath) === ".js"
            || path.extname(itemPath) === ".vue"
          ) {
            results.push(itemPath);
          }
        }
      } else if (path.extname(rootPath) === ".js"
        || path.extname(rootPath) === ".vue") {
        results.push(rootPath);
      }
    } catch (error) {
      console.error("目录查找失败"); // 如果没有或者缺少文件名参数，则打印错误信息
      process.exit(1);
    }

    return results;
  }

  const files = readFilesFromRoot(`${process.cwd()}\\${args[0]}`);

  function batchAction(file) {
    const vueFileContent = fs.readFileSync(file, { encoding: "utf-8" });
    let descriptor;
    try {
      descriptor = parse(vueFileContent)?.descriptor;
    } catch (error) {
      console.log(error);
      return console.log('你的代码暂不支持解析');
    }

    const { script } = (descriptor.script && descriptor) || {
      script: { content: vueFileContent },
    };

    const { content } = script;
    let astRes;
    try {
      astRes = astParser.parse(content, {
        sourceType: "module",
        plugins: ["decorators", 'jsx'],
        errorRecovery: true,
      });
    } catch (error) {
      console.log(error);
      return console.log('你的代码暂不支持解析');
    }

    const classDefine = astRes.program.body.find(
      (ex) => ex.type === "ExportDefaultDeclaration",
    );
    if (!classDefine) return; // 不是类vue或js
    const decoratorComponent = classDefine?.declaration?.decorators?.find(
      (ex) => ex.type === "Decorator" && ex.expression.callee.name === "Component",
    );
    if (!decoratorComponent) return; // 没有Component修饰符

    const vuexImportStringSet = new Set();
    // 过滤掉vue-property-decorator vuex-class
    astRes.program.body = astRes.program.body
      .filter((ex) => ex.type !== "ExportDefaultDeclaration")
      ?.filter(
        (ex) => {
          if (ex?.source?.value === "vuex-class") {
            ex?.specifiers.forEach((ei) => {
              if (vuexClassDecorator.includes(ei?.imported?.name)) {
                vuexImportStringSet.add(ei?.imported?.name);
              }
            });
          }
          if (!["vue-property-decorator", "vuex-class"].includes(ex?.source?.value)) {
            return true;
          }

          return false;
        },
      );

    const importDefine = astRes.program;

    fs.writeFileSync("./classDefine.json", JSON.stringify(classDefine), {
      encoding: "utf-8",
    });
    // fs.writeFileSync("./importDefine.json", JSON.stringify(importDefine), {
    //   encoding: "utf-8",
    // });
    function generateTemp() {
      const classbody = classDefine.declaration.body?.body;
      if (!classbody) return;
      const vueMethodsStringSet = new Set([
        "beforeCreate",
        "created",
        "beforeDestroy",
        "destroyed",
        "beforeMount",
        "mounted",
        "beforeUpdate",
        "updated",
        "activated",
        "deactivated",
        "updated",
      ]);

      const vuexClassDecoratorToMap = {
        Mutation: {
          key: "mapMutations",
          map: "methods",
        },
        State: {
          key: "mapState",
          map: "computed",
        },

        Action: {
          key: "mapActions",
          map: "methods",
        },

        Getter: {
          key: "mapGetters",
          map: "computed",
        },
      };

      const specialArguments = {
        components: "",
        mixins: "",
      };
      const someVueArguments = {
        // inheritAttrs: false,
        transitions: [],
        directives: [],
        props: [],
        filters: [],
        data: [],
        computed: [],
        methods: [],
        watch: [],
      };
      const vueOwnMethodsArr = [];
      const vueArguments = { ...someVueArguments, ...specialArguments };

      //  在模板中把vuex-class导入的namespace删除 并返回vuex用到的模块

      function vuecClassNamespaceTocreateNamespacedHelpers() {
        const moduleNameMap = {};
        importDefine.body = importDefine.body.filter((ex) => {
          if ((ex.type === 'VariableDeclaration' && ex.declarations.length) && ex.declarations
            .find((em) => {
              if (em.init && em.init?.callee && em.init?.callee?.name === 'namespace' && em.id?.name && Array.isArray(em.init?.arguments)) {
                moduleNameMap[em.id.name] = em.init.arguments[0]?.value;
                return true;
              }
              return null;
            })) {
            return false;
          }
          return true;
        });
        return moduleNameMap;
      }
      const vuexMapModule = vuecClassNamespaceTocreateNamespacedHelpers();
      const importDeclarationString = generate(astRes.program).code;
      // @Component装饰器参数 继承vue
      const classDefinetDecoratorsArguments = decoratorComponent?.expression?.arguments;
      const argProperties = (classDefinetDecoratorsArguments?.[0] || {})
        .properties;

      // class body
      function hasThisKeyword(value) {
        // 检查字符串中是否包含 "ThisExpression"

        if (value && JSON.stringify(value).includes("ThisExpression")) {
          return true;
        }

        return false;
      }
      function removeBraces(str) {
        const regex = /{([\s\S]*)}/;
        const match = str.match(regex);
        if (match) {
          return match[1].trim();
        }
        return str;
      }
      // 头部尾部注释处理
      function filterComments(exl) {
        const trailingComments = (exl.trailingComments?.length
          && `/* ${exl.trailingComments?.reduce(
            (a, b) => `${a} ${b.value}`,
            "",
          )} */`)
          || "";
        const leadingComments = (exl.leadingComments?.length
          && `/* ${exl.leadingComments?.reduce(
            (a, b) => `${a} ${b.value}`,
            "",
          )} */`)
          || "";
        return {
          trailingComments,
          leadingComments,
        };
      }
      function classBodyDecoratorFilter() {
        // 这个方法只处理修饰符
        const vuexObj = {
          State: {},
          Mutation: {},
          Action: {},
          Getter: {},
        };
        classbody.forEach((exl) => {
          if (!exl.decorators?.length) return;
          const { trailingComments, leadingComments } = filterComments(exl);
          const decoratorsData = exl.decorators[0];
          const dex = decoratorsData.expression;
          // MemberExpression则是vuex分模块 Identifier则是主模块
          const calleeData = dex?.callee;
          const argumentsData = dex?.arguments;
          const argumentsDataZeroEl = argumentsData?.[0];
          const argumentsDataOneEl = argumentsData?.[1];
          if (!exl.key?.name) return;
          const exlKeyName = exl.key.name;

          // 例State有以下情况
          // @State foo;
          // @State("zoo") zoo;
          // @globalModule.State("goodsSetting") goodsSetting;
          if (!dex.callee && vuexClassDecorator.includes(dex.name)) {
            /*   @State foo; 没有calle参数
       If the argument is omitted, use the property name
        */
            const noCalleedecoratorName = dex.name;
            const tr = {
              name: exlKeyName,
              value: exlKeyName,
              trailingComments,
              leadingComments,
              type: "StringLiteral",
            };
            if (!vuexObj[noCalleedecoratorName]._MainVuexModule_) {
              vuexObj[noCalleedecoratorName]._MainVuexModule_ = [tr];
            } else {
              vuexObj[noCalleedecoratorName]._MainVuexModule_.push(tr);
            }
            return;
          }

          const decoratorName = calleeData?.name
            || /* @State("zoo") zoo */ calleeData.property
              ?.name/* @globalModule.State("goodsSetting") goodsSetting */ || dex.name; // @Log 自定义修饰符

          // 处理有修饰符的State、Mutation、Action、Getter
          if (vuexClassDecorator.includes(decoratorName) && argumentsDataZeroEl) {
            const moduleArgumentsName = generate(argumentsDataZeroEl).code; // 例goodsSetting
            const tr = {
              name: moduleArgumentsName.toString(),
              value: exl.key.name,
              trailingComments,
              leadingComments,
              type: argumentsDataZeroEl.type,
            };
            const moduleName = calleeData?.object?.name; // 例globalModule
            const nextModuleName = calleeData.type === "MemberExpression"
              ? moduleName
              : "_MainVuexModule_";
            if (!vuexObj[decoratorName][nextModuleName]) {
              vuexObj[decoratorName][nextModuleName] = [tr];
            } else {
              vuexObj[decoratorName][nextModuleName].push(tr);
            }
          } else if (decoratorName === "Prop") {
            // 处理有修饰符的Prop来源vue-property-decorator
            if (argumentsDataZeroEl) {
              const match = generate(argumentsDataZeroEl).code;
              vueArguments.props.push(
                `${exlKeyName}: ${["ObjectExpression", "ArrayExpression"].includes(
                  argumentsDataZeroEl.type,
                )
                  ? `${match} ${trailingComments}`
                  : `[${match}] ${trailingComments}`
                } `,
              );
            } else {
              vueArguments.props.push(
                `${[
                  exlKeyName,
                ]}: [String, Number, Boolean, Array, Object, Date, Function, Symbol]`,
              );
            }
          } else if (decoratorName === "Watch" && argumentsDataZeroEl) {
            // 处理有修饰符的Watch来源vue-property-decorator
            const matchAZero = generate(argumentsDataZeroEl).code; // watch参数
            const matchAOne = argumentsDataOneEl && generate(argumentsDataOneEl).code; // watch参数
            const temoExl = { ...exl };
            delete temoExl.decorators;
            delete temoExl.trailingComments; // 没有人把方法注释在尾部
            const matchExl = generate(temoExl).code;
            vueArguments.methods.push(matchExl);
            vueArguments.watch.push(`${matchAZero}: {
  handler: '${exlKeyName}',
  ${(matchAOne && removeBraces(matchAOne)) || ""}
        } `);
          } else if (decoratorName === "Emit") {
            // 处理有修饰符的Emit来源vue-property-decorator
            const matchAZero = argumentsDataZeroEl?.value;
            const temoExl = { ...exl };
            delete temoExl.decorators;
            delete temoExl.trailingComments; // 没有人把方法注释在尾部
            const temoExlBodyBody = temoExl.body?.body || [];
            const returnValue = temoExlBodyBody.find(
              (st) => st.type === "ReturnStatement",
            )?.argument;
            const blockStatement = { ...temoExl.body };
            blockStatement.body = blockStatement.body.filter(
              (st) => st.type !== "ReturnStatement",
            );
            const bodyValueNoIncludeReturnValueString = removeBraces(
              generate(blockStatement).code,
            );
            const paramsValue = temoExl.params.length && temoExl.params.map((ei) => ei.name);
            const emitParams = (
              (returnValue && [generate(returnValue).code])
              || []
            )
              .concat(paramsValue)
              .filter((nl) => nl)
              .join(",");
            const emitTemplete = `
        ${leadingComments}
         ${exlKeyName} (${paramsValue || ""}) {
     ${bodyValueNoIncludeReturnValueString}
  this.$emit("${matchAZero || exlKeyName}"${emitParams ? `,${emitParams}` : ""
              });
    }
`;
            vueArguments.methods.push(emitTemplete);
          }
        });
        // 处理vuex引入的模块 并在computed与methods中声明

        for (const key in vuexObj) {
          const thisObject = vuexObj[key];
          if (Object.keys(thisObject).length) {
            for (const ownKey in thisObject) {
              if (thisObject[ownKey]?.length) {
                const moduleArr = [];

                thisObject[ownKey].forEach((nx) => {
                  const tName = nx.name.replace(/^["']|["']$/g, "");
                  const name = nx.type === "StringLiteral" ? `"${tName}"` : tName;
                  moduleArr.push(
                    `${nx.value}:${name && name + nx.trailingComments} `,
                  );
                });

                vueArguments[vuexClassDecoratorToMap[key].map].unshift(
                  `...${vuexClassDecoratorToMap[key].key} (${ownKey === "_MainVuexModule_" ? "" : `'${vuexMapModule[ownKey]}',`
                  } {${moduleArr.join(",")} })`,
                );
                vuexImportStringSet.add(key);
              }
            }
          }
        }
      }
      classBodyDecoratorFilter();

      // 处理 mixins
      function mixinsFilter() {
        // mixins 来源两部分  一部分类继承的 二部分@Component装饰器里面的参数
        let mixins1 = [];
        const mixins2 = [];

        // 第一部分类继承的
        const hasMixins1Flag = classDefine.declaration.superClass?.callee?.name === "Mixins";
        mixins1 = hasMixins1Flag
          && classDefine.declaration.superClass.arguments.map((ex) => ex.name);

        // 第二部分装饰器的
        const mixinsList = argProperties?.find((ex) => ex.key.name === "mixins")?.value
          ?.properties || [];

        mixinsList.forEach((ex) => {
          mixins2.push(ex.method ? generate(ex).code : `${ex.value.name} `);
        });
        vueArguments.mixins = (mixins1.length || mixins2.length)
          && `mixins: [${Array.from(new Set(mixins1.concat(mixins2)))}], `;
      }
      mixinsFilter();

      // 批量处理@Component装饰器里面的参数
      function componentArgumentsBatchAction() {
        // eslint-disable-next-line no-restricted-syntax
        for (const key in vueArguments) {
          if (Object.hasOwnProperty.call(vueArguments, key) && key !== "mixins") {
            // 对应key的本身
            const propertiesOwn = argProperties?.find(
              (ex) => ex.key.name === key,
            );
            // 对应key的value的properties
            // const propertiesList = propertiesOwn?.value?.properties;
            if (propertiesOwn) {
              if (key === "components") {
                // 对components单独处理
                vueArguments[key] = `${generate(propertiesOwn).code}, `;
              } else if (
                key === "computed"
                || key === "watch"
                || key === "directives"
                || key === "transitions"
                || key === "filters"
                || key === "data"
                || key === "methods"
              ) {
                // 会删除部分注释
                const match = generate(propertiesOwn).code;
                const th = removeBraces(match);
                if (th) {
                  vueArguments[key].push(removeBraces(match));
                }
              } else if (key === "props") {
                if (propertiesOwn.value?.type === "ObjectExpression") {
                  const match = generate(propertiesOwn.value).code;
                  const th = removeBraces(match);
                  if (th) {
                    vueArguments[key].push(removeBraces(match));
                  }
                } else if (
                  propertiesOwn.value?.type === "ArrayExpression"
                  && propertiesOwn.value?.elements.length
                ) {
                  const elementsList = propertiesOwn.value.elements;
                  elementsList.forEach((exl) => {
                    vueArguments.props.push(
                      `${[
                        exl.value,
                      ]
                      }: [String, Number, Boolean, Array, Object, Date, Function, Symbol]`,
                    );
                  });
                }
              }
            }
          }
        }
      }
      componentArgumentsBatchAction();

      // 批量处理Class Set Get
      function btachClassGetOrSetToVueComputed() {
        const computedObj = {};
        classbody
          .filter(
            (ex) => ex.type === "ClassMethod"
              && !ex.decorators
              && (ex.kind === "set" || ex.kind === "get"),
          )
          .forEach((nx) => {
            const paramsValue = nx.params.length && nx.params.map((ei) => ei.name);
            const setOrTemplete = `${nx.kind} (${(paramsValue && paramsValue.join(",")) || ""
              })  ${generate(nx.body).code} `;
            if (!computedObj[nx.key.name]) {
              computedObj[nx.key.name] = [setOrTemplete];
            } else {
              computedObj[nx.key.name].push(setOrTemplete);
            }
          });

        for (const key in computedObj) {
          vueArguments.computed.push(`${key}: {${computedObj[key].join(",")} } `);
        }
      }
      btachClassGetOrSetToVueComputed();

      const tempVueCreatedMethodAddBodyItemArr = [];
      // 批量处理ClassProperty
      function btachClassPropertyToVueData() {
        classbody
          .filter(
            (ex) => ex.type === "ClassProperty"
              && !ex.decorators
              && !ex.kind
              && !ex.body,
          )
          .forEach((nx) => {
            const { trailingComments } = filterComments(nx);
            if (hasThisKeyword(nx.value)) { // 如过属性中含有this表达 将要放在 vue created函数里面
              const temp = JSON.parse(JSON.stringify(nx));
              temp.key.name = `this.${temp.key.name}`;
              delete temp.trailingComments;
              tempVueCreatedMethodAddBodyItemArr.push(temp);
              vueArguments.data.push(
                `${nx.key.name}:undefined`,
              );
            } else {
              vueArguments.data.push(
                `${nx.key.name}:${generate(nx.value).code || undefined
                } ${trailingComments} `,
              );
            }
          });
      }
      btachClassPropertyToVueData();

      // 批量处理Class 方法 筛选出vue生命周期和methods
      function btachClassMethodsToVueMethods() {
        let hasCreatedFlag = false;
        classbody
          .filter(
            (ex) => ex.type === "ClassMethod" && !ex.decorators && ex.kind === "method",
          )
          .forEach((nx) => {
            const tp = { ...nx };

            delete tp.trailingComments;
            if (vueMethodsStringSet.has(tp.key.name)) {
              if (tp.key.name === 'created') {
                hasCreatedFlag = true;
                tp.body.body = tp.body.body.concat(tempVueCreatedMethodAddBodyItemArr);
              }
              vueOwnMethodsArr.push(generate(tp).code);
            } else {
              vueArguments.methods.push(generate(tp).code);
            }
          });

        if (!hasCreatedFlag && tempVueCreatedMethodAddBodyItemArr.length) {
          vueOwnMethodsArr.push(`created () {
            ${tempVueCreatedMethodAddBodyItemArr.map((nl) => generate(nl).code).join('')
            }}`);
        }
      }
      btachClassMethodsToVueMethods();

      // 批量处理vue自有属性
      function btachVuePropsAction() {
        for (const key in someVueArguments) {
          if (someVueArguments[key].length && key !== "data") {
            // 下面对data单独处理
            vueArguments[key] = `${key}: { 
    ${vueArguments[key].map((ex) => ex)}
            }, `;
          }
        }
      }
      btachVuePropsAction();

      const importVuexSting = vuexImportStringSet.size ? `import {${Array.from(vuexImportStringSet).map((ex) => vuexClassDecoratorToMap[ex].key)} } from 'vuex'` : '';

      const temp = `
          ${importVuexSting}  
      ${importDeclarationString}

            export default {
              name: '${classDefine.declaration.id.name}',
              ${vueArguments.props || ""} 
       ${vueArguments.components || ""}
            data() {
              return {
                ${vueArguments.data.join(",") || ""}
            };
          },
       ${(vueArguments.directives.length && vueArguments.directives) || ""}
       ${(vueArguments.filters.length && vueArguments.filters) || ""}
       ${(vueArguments.mixins.length && vueArguments.mixins) || ""}
       ${(vueOwnMethodsArr.length && `${vueOwnMethodsArr.join(",")},`) || ""}
       ${(vueArguments.computed.length && vueArguments.computed) || ""}
       ${(vueArguments.methods.length && vueArguments.methods) || ""}
       ${(vueArguments.watch.length && vueArguments.watch) || ""}
        };
        `;
      const scriptEx = /(?<=<script>).*(?=<\/script>)/s;
      if (scriptEx.test(vueFileContent)) {
        return vueFileContent.replace(scriptEx, temp);
      }
      return temp;
    }
    let error;
    try {
      fs.writeFileSync(file, generateTemp(classDefine, importDefine), {
        encoding: "utf-8",
      });
      console.log(`写入${file} 成功`);
      error = null;
    } catch (e) {
      console.log(`写入${file} 失败:${e}`);
      error = `写入${file} 失败:${e} `;
    }
    return { file, error };
  }

  if (!files.length) {
    console.error("当前目录下并未发现可转化文件"); // 如果没有或者缺少文件名参数，则打印错误信息
    process.exit(1); // 退出脚本
  }
  function spawnPrettier(file) {
    let prettierCmd;

    switch (process.platform) {
      case 'win32':
        prettierCmd = 'prettier.cmd';
        break;
      default:
        prettierCmd = 'npx';
        break;
    }

    const prettierPath = path.join(__dirname, 'node_modules', '.bin', prettierCmd);

    const child = spawn(prettierPath, ['prettier', '--write', file]);

    child.on('close', () => {
      console.log(`prettier 美化代码完成`);
    });
  }
  function g(params) {
    const res = [];
    params.forEach((ex) => {
      const rs = batchAction(ex);
      if (rs) {
        res.push(rs);
      }
    });
    if (res.length) {
      console.log('写入文件', res.length, '个');
      console.log('成功', res.filter((ex) => !ex.error).length, '个');
      console.log('失败', res.filter((ex) => ex.error).length, '个');
      console.log(`美化代码中...`);

      try {
        spawnPrettier(`${fs.statSync(args[0]).isDirectory() ? `${args[0]}/**/*` : args[0]}`);
      } catch (error) {
        console.log(`美化代码失败，请手动使用prettier或其他工具美化`);
      }

      fs.writeFileSync(`.RESULT.md`, JSON.stringify(res), {
        encoding: "utf-8",
      });
    }
  }
  g(files);
}

function q() {
  rl.question('当前操作会可能会重写你的代码，确认继续，要不要继续：y/继续 n/算了', (command) => {
    // 在这里可以对用户输入的命令进行处理

    if (command === 'n') {
      process.exit(1);
    } else if (command === 'y') {
      rl.close();
      createG();
    } else {
      q();
    }

    // 关闭 readline 接口
  });
}
q();
