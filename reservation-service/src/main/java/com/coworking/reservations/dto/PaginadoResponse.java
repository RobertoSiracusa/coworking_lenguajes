package com.coworking.reservations.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import java.util.List;

@Data
@AllArgsConstructor
public class PaginadoResponse<T> {
    private int pagina;
    private int porPagina;
    private long total;
    private int totalPaginas;
    private List<T> datos;
}
