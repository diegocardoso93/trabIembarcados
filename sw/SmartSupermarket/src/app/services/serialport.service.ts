
import { Injectable } from '@angular/core';
import * as SerialPort from 'serialport';
import { Observable } from 'rxjs/Observable';

import { IndexedDbService } from './indexed-db.service';

@Injectable()
export class SerialPortService {
  arduinoComName;
  arduinoPort;

  constructor(public indexedDb: IndexedDbService) {
    /*
    [{
        "comName" : "COM1",
        "manufacturer" : "(Tipos de porta padr�o)",
        "pnpId" : "ACPI\\PNP0501\\1"
      }, {
        "comName" : "COM19",
        "manufacturer" : "http://www.intel.com",
        "pnpId" : "USB\\VID_8087&PID_0AB6\\AE6774SQ60600P5",
        "locationId" : "Port_#0003.Hub_#0004",
        "vendorId" : "8087",
        "productId" : "0AB6"
      }
    ]
    */
    SerialPort.list((err, ports) => {
      console.log('ports', ports);
      for (let port of ports){
        if ((port.vendorId == '8087' && port.productId == '0AB6')  // uno 101
         || (port.vendorId == '2341' && port.productId == '003D')) // due
         {
          this.arduinoComName = port.comName;
          this.arduinoPort = new SerialPort(this.arduinoComName, {
            parser: SerialPort.parsers.readline('#'),
            baudRate: 9600 });

          this.arduinoPort.on('open', () => {
              //window.setTimeout(this.enviarTeste(), 4000);
          });

          this.arduinoPort.on('data', (data) => {
            this.trataDadosRecebidos(data);
          });
        }
      }
    });
  }

  enviar(dados: any) {
    this.arduinoPort.write(dados, (err) => {
      console.log(err);
      this.gravarLog(new Date().toLocaleString(), ''+dados, 1);
    });
  }


  trataDadosRecebidos(dados) {
    //log
    this.gravarLog(new Date().toLocaleString(), ''+dados, 0);

    console.log(dados);
    if (dados[0] == '0'){ //consultar
      var uuid = dados.substring(2);
      this.indexedDb.getByKey('tags', uuid).then((tag)=>{
        if (tag){
          let prod_id = tag.prod_id;
          this.indexedDb.getByKey('produtos', prod_id).then((produto)=>{
            if (produto) {
              this.enviar('0|'+produto.id+'|'+produto.nome+'|R$'+parseFloat(produto.preco).toFixed(2)+'#');
            }else{
              this.enviar('2|'+uuid+'|tag nao encontrada#');
            }
          });
        }else{
          this.enviar('2|'+uuid+'|tag nao encontrada#');
        }
      });
    }else if (dados[0] == '1'){ //comprar
      var arrDados = dados.substring(2).split('|');
      if (arrDados[1]){ //compra ja iniciada
        let uuid = arrDados[0];
        let compra_id = arrDados[1];
        this.indexedDb.getByKey('tags', uuid).then((tag)=>{
          if (tag){
            let prod_id = tag.prod_id;
            this.indexedDb.getByKey('produtos', prod_id).then((produto)=>{
              if (produto) {
                let itemCompra = {id_compra:compra_id, preco:produto.preco, id_produto: produto.id};
                this.indexedDb.add('itemCompra', itemCompra).then((res) => {
                  console.log('itemCompra inserido com sucesso!');
                  this.indexedDb.getAll('itemCompra').then((itensCompra) => {
                    let preco = 0;
                    for (let item of itensCompra) {
                      if (compra_id==item.id_compra) {
                        preco += +item.preco;
                      }
                    }
                    preco = parseFloat(preco.toFixed(2));
                    let compra = {id:+compra_id,preco:preco,data:new Date().toLocaleString(),status:'Em andamento'};
                    this.indexedDb.update('compras', compra).then((res) => {
                      console.log('Compra atualizada com sucesso!');
                      this.enviar('1|'+produto.id+'-'+produto.nome+'|R$'+parseFloat(produto.preco).toFixed(2)+'|'+compra_id+'|R$'+parseFloat(preco+'').toFixed(2)+'#');
                    }, (error) => {
                        console.log(error);
                    });
                  }, (error) => {
                      console.log(error);
                  });
                }, (error) => {
                    console.log(error);
                });
              }else{
                this.enviar('2|'+uuid+'|tag nao encontrada|'+compra_id+'#');
              }
            });
          }else{
            this.enviar('2|'+uuid+'|tag nao encontrada|'+compra_id+'#');
          }
        });
      }else{ //primeiro produto
        let uuid = arrDados[0];
        this.indexedDb.getByKey('tags', uuid).then((tag)=>{
          if (tag){
            let prod_id = tag.prod_id;
            this.indexedDb.getByKey('produtos', prod_id).then((produto)=>{
              if (produto) {
                let compra = {data:new Date().toLocaleString(),preco:produto.preco,status:'Em andamento'};
                this.indexedDb.add('compras', compra).then((res) => {
                  console.log('Compra inserida com sucesso!');
                  let compra_id = res.key;
                  let itemCompra = {id_compra:res.key, preco:produto.preco, id_produto: produto.id};
                  this.indexedDb.add('itemCompra', itemCompra).then((res) => {
                    console.log('itemCompra inserido com sucesso!');
                    this.enviar('1|'+produto.id+'-'+produto.nome+'|R$'+parseFloat(produto.preco).toFixed(2)+'|'+compra_id+'|R$'+parseFloat(produto.preco).toFixed(2)+'#');
                  }, (error) => {
                      console.log(error);
                  });
                }, (error) => {
                    console.log(error);
                });
              }else{
                this.enviar('2|'+uuid+'|tag nao encontrada#');
              }
            });
          }else{
            this.enviar('2|'+uuid+'|tag nao encontrada#');
          }
        });

      }

    }else if(dados[0] == '3'){ //concluir compra
      var arrDados = dados.substring(2).split('|');
      let compra_id = arrDados[0];
      this.indexedDb.getAll('itemCompra').then((itensCompra) => {
        let preco = 0;
        for (let item of itensCompra) {
          if (compra_id==item.id_compra) {
            preco += +item.preco;
          }
        }
        preco = parseFloat(preco.toFixed(2));
        let compra = {id:+compra_id,preco:preco,data:new Date().toLocaleString(),status:'Concluida'};
        this.indexedDb.update('compras', compra).then((res) => {
          console.log('Compra atualizada com sucesso!');
          if (compra){
            this.enviar('3|'+compra_id+'|R$'+parseFloat(preco+'').toFixed(2)+'#');
          }else{
            this.enviar('2|'+compra_id+'|compra nao encontrada|#');
          }
        }, (error) => {
            console.log(error);
        });
      });
    }else if(dados[0] == '4'){ //cancelar compra
      var arrDados = dados.substring(2).split('|');
      let compra_id = arrDados[0];
      this.indexedDb.getAll('itemCompra').then((itensCompra) => {
        let preco = 0;
        for (let item of itensCompra) {
          if (compra_id==item.id_compra) {
            preco += +item.preco;
          }
        }
        preco = parseFloat(preco.toFixed(2));
        let compra = {id:+compra_id,preco:preco,data:new Date().toLocaleString(),status:'Cancelada'};
        this.indexedDb.update('compras', compra).then((res) => {
          console.log('Compra atualizada com sucesso!');
          if (compra){
            this.enviar('4|'+compra_id+'|R$'+parseFloat(preco+'').toFixed(2)+'#');
          }else{
            this.enviar('2|'+compra_id+'|compra nao encontrada|#');
          }
        }, (error) => {
            console.log(error);
        });
      });
    }
  }

  enviarTeste() {
    this.enviar('hello wordl#');
  }

  gravarLog(datetime:string, dados:string, direcao:number) {
    let logSerial = {quando:datetime, dados:dados, direcao:direcao};
    this.indexedDb.update('logSerial', logSerial).then(() => {
        console.log('Log inserido com sucesso!');
    }, (error) => {
        //console.log(error);
    });
  }

}
